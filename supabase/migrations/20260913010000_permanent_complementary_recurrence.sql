-- Match Principal: null repeat_count means permanent, bounded by today + 90 days.
alter table public.reservation_series
  alter column repeat_count drop not null,
  add column recurrence_payload jsonb,
  add constraint reservation_series_permanent_payload check (
    (repeat_count is not null or recurrence_payload is not null)
    and (recurrence_payload is null or (
      jsonb_typeof(recurrence_payload) = 'object'
      and not recurrence_payload ? 'primary'
      and jsonb_typeof(recurrence_payload->'complementary') = 'object'
    ))
  );

-- Existing finite series are already fully materialized and need no backfill.
create function public.materialize_recurring_reservations(
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

create or replace function public.create_admin_reservation_series(p_business_id uuid,p_payload jsonb,p_repeat_count integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  first_date date; new_series_id uuid; result jsonb;
  local_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if auth.uid() is null or not private.has_business_role(p_business_id,array['owner','admin']::public.business_role[])
    then raise exception 'reservation_series_forbidden' using errcode='42501'; end if;
  if p_repeat_count not between 2 and 260 or jsonb_typeof(p_payload->'complementary') is distinct from 'object'
    then raise exception 'reservation_series_invalid' using errcode='22023'; end if;
  if p_payload ? 'primary' then raise exception 'reservation_series_complementary_only' using errcode='22023'; end if;
  first_date := (p_payload->'complementary'->>'date')::date;
  if first_date is null or first_date < local_today then raise exception 'reservation_series_invalid' using errcode='22023'; end if;
  if p_repeat_count is null and first_date > local_today+90 then raise exception 'recurring_start_outside_horizon' using errcode='22023'; end if;
  insert into public.reservation_series(business_id,starts_on,repeat_count,created_by,recurrence_payload)
    values(p_business_id,first_date,p_repeat_count,auth.uid(),p_payload) returning id into new_series_id;
  -- Same transaction: any invalid payload or conflict rolls back the identity too.
  result := public.materialize_recurring_reservations(p_business_id,new_series_id,null);
  return result || jsonb_build_object('count',(result->>'created_count')::integer);
end $$;

revoke all on function public.materialize_recurring_reservations(uuid,uuid,date) from public,anon;
grant execute on function public.materialize_recurring_reservations(uuid,uuid,date) to authenticated;
comment on column public.reservation_series.repeat_count is 'Null: permanent through rolling today + 90 days; otherwise 2–260 weekly occurrences.';
comment on column public.reservation_series.recurrence_payload is 'Server-validated immutable creation template; legacy finite series require no backfill. No direct authenticated writes.';
comment on function public.materialize_recurring_reservations(uuid,uuid,date) is 'Owner/admin idempotent horizon expansion, matching Principal 90-day cap; delegates occupancy to existing Admin reservation engine.';
