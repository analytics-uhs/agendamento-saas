-- Additive cancellation boundary; never delete series or cancelled occurrences.
alter table public.reservation_series
  add column cancelled_from date,
  add constraint reservation_series_cancelled_from_valid check (cancelled_from >= starts_on);
comment on column public.reservation_series.cancelled_from is
'Inclusive termination date. Null means not terminated. Materialization must never create occurrences on or after this date.';

create or replace function public.materialize_recurring_reservations(
  p_business_id uuid, p_series_id uuid, p_horizon_date date default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  series public.reservation_series%rowtype;
  current_business uuid;
  local_today date := (now() at time zone 'America/Sao_Paulo')::date;
  horizon date; occurrence_date date; dates date[];
  v_option_id uuid; mode public.booking_group_occupancy_mode; option_name text;
  start_at time; end_at time; result jsonb; conflicts jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or not private.has_business_role(p_business_id,array['owner','admin']::public.business_role[])
    then raise exception 'reservation_series_forbidden' using errcode='42501'; end if;
  -- The delegated Admin engine selects this same tenant. Fail closed on mismatch.
  select m.business_id into current_business from public.business_members m join public.businesses b on b.id=m.business_id
    where m.user_id=auth.uid() and m.role in ('owner','admin') and b.active order by m.created_at,m.id limit 1;
  if current_business is distinct from p_business_id then raise exception 'reservation_series_forbidden' using errcode='42501'; end if;
  select s.* into series from public.reservation_series s
    where s.id=p_series_id and s.business_id=p_business_id for update;
  if not found then raise exception 'reservation_series_forbidden' using errcode='42501'; end if;
  if series.recurrence_payload is null then
    return jsonb_build_object('series_id',series.id,'created_count',0);
  end if;
  horizon := case when series.repeat_count is null then
    least(coalesce(p_horizon_date,local_today+90),local_today+90)
    else least(coalesce(p_horizon_date,series.starts_on+(series.repeat_count-1)*7),series.starts_on+(series.repeat_count-1)*7) end;
  -- Inclusive termination: neither finite nor permanent series may grow at/after it.
  if series.cancelled_from is not null then
    horizon := least(horizon, series.cancelled_from - 1);
  end if;
  v_option_id := (series.recurrence_payload->'complementary'->>'option_id')::uuid;
  mode := (series.recurrence_payload->'complementary'->>'occupancy_mode')::public.booking_group_occupancy_mode;
  start_at := nullif(series.recurrence_payload->'complementary'->>'start_time','')::time;
  end_at := nullif(series.recurrence_payload->'complementary'->>'end_time','')::time;
  select o.name into option_name from public.booking_options o join public.booking_groups g on g.id=o.group_id and g.business_id=o.business_id
    where o.id=v_option_id and o.business_id=p_business_id and o.active and g.active and g.position=3 and g.occupancy_mode=mode
    for share of o,g;
  if not found then raise exception 'reservation_complementary_option_invalid' using errcode='22023'; end if;
  -- Only absent dates, including neither past days nor cancelled existing occurrences.
  select coalesce(array_agg(d order by d),'{}'::date[]) into dates from (
    select series.starts_on+n*7 as d
    from generate_series(greatest(0,(local_today-series.starts_on+6)/7),(horizon-series.starts_on)/7) n
    where series.starts_on+n*7 between local_today and horizon
      and not exists(select 1 from public.reservations r where r.series_id=series.id and r.series_date=series.starts_on+n*7)
  ) candidates;
  foreach occurrence_date in array dates loop
    perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||':'||occurrence_date::text,0));
    perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||':'||v_option_id::text||':'||occurrence_date::text,0));
  end loop;
  foreach occurrence_date in array dates loop
    if exists(select 1 from public.resource_allocations a where a.business_id=p_business_id and a.option_id=v_option_id and a.active
      and a.occupied_period && private.complementary_period(mode,occurrence_date,start_at,end_at)) then
      conflicts := conflicts || jsonb_build_array(jsonb_build_object('date',occurrence_date,'resource',option_name,'startTime',start_at));
    end if;
  end loop;
  if jsonb_array_length(conflicts)>0 then raise exception 'reservation_series_conflict' using errcode='23P01',detail=conflicts::text; end if;
  foreach occurrence_date in array dates loop
    begin
      result := public.create_admin_reservation(jsonb_set(series.recurrence_payload,'{complementary,date}',to_jsonb(occurrence_date)));
    exception when exclusion_violation then
      raise exception 'reservation_series_conflict' using errcode='23P01',
        detail=jsonb_build_array(jsonb_build_object('date',occurrence_date,'resource',option_name,'startTime',start_at))::text;
    end;
    update public.reservations set series_id=series.id,series_date=occurrence_date where id=(result->>'reservation_id')::uuid;
  end loop;
  return jsonb_build_object('series_id',series.id,'created_count',cardinality(dates),'materialized_through',horizon,'permanent',series.repeat_count is null);
end $$;

create or replace function public.cancel_admin_reservation_series(
  p_business_id uuid, p_reservation_id uuid, p_scope text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  selected public.reservations%rowtype;
  item record;
  affected integer := 0;
begin
  if auth.uid() is null or not private.has_business_role(p_business_id,array['owner','admin']::public.business_role[])
    then raise exception 'reservation_series_forbidden' using errcode='42501'; end if;
  if p_scope is null or p_scope not in ('single','future')
    then raise exception 'recurring_invalid_cancel_scope' using errcode='22023'; end if;
  select r.* into selected from public.reservations r
    where r.id=p_reservation_id and r.business_id=p_business_id;
  if not found or selected.series_id is null
    then raise exception 'reservation_series_forbidden' using errcode='42501'; end if;

  -- Same lock/order as materialization: expansion and cancellation serialize.
  perform 1 from public.reservation_series s
    where s.id=selected.series_id and s.business_id=p_business_id for update;
  if not found then raise exception 'reservation_series_forbidden' using errcode='42501'; end if;
  -- Do not expose cancellation of legacy combined/Principal series in this RPC.
  if exists(select 1 from public.appointments a join public.reservations r on r.id=a.reservation_id
      where r.series_id=selected.series_id and r.business_id=p_business_id)
    or not exists(select 1 from public.reservation_resources rr
      where rr.reservation_id=selected.id and rr.business_id=p_business_id)
    then raise exception 'reservation_series_complementary_only' using errcode='22023'; end if;

  if p_scope='future' then
    update public.reservation_series
      set cancelled_from=least(cancelled_from,selected.series_date)
      where id=selected.series_id and business_id=p_business_id;
  end if;
  for item in select r.id from public.reservations r
    where r.series_id=selected.series_id and r.business_id=p_business_id
      and (r.id=selected.id or (p_scope='future' and r.series_date>=selected.series_date))
    order by r.series_date,r.id for update
  loop
    -- Preserve aggregates, dates and existing allocation/status synchronization.
    perform public.cancel_admin_reservation(item.id);
    affected := affected + 1;
  end loop;
  return jsonb_build_object('count',affected);
end $$;

revoke all on function public.cancel_admin_reservation_series(uuid,uuid,text) from public,anon;
grant execute on function public.cancel_admin_reservation_series(uuid,uuid,text) to authenticated;
comment on function public.cancel_admin_reservation_series(uuid,uuid,text) is
'Owner/admin Complementary-only cancellation. Future persists an inclusive cutoff atomically with occurrence cancellation; single retains the occurrence identity.';

