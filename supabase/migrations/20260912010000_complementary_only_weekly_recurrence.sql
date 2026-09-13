-- Narrow the previously applied implementation to Admin Complementary-only.
-- Preserve historical migrations and the existing one-off cancellation path.
create or replace function public.create_admin_reservation_series(p_business_id uuid,p_payload jsonb,p_repeat_count integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  current_business uuid; first_date date; occurrence_date date; occurrence jsonb; result jsonb;
  v_series_id uuid; v_option_id uuid; mode public.booking_group_occupancy_mode; option_name text;
  start_at time; end_at time; conflicts jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or not private.has_business_role(p_business_id,array['owner','admin']::public.business_role[])
    then raise exception 'reservation_series_forbidden' using errcode='42501'; end if;
  -- Match the current incumbent engine's business selection; never mutate a different tenant.
  select m.business_id into current_business from public.business_members m join public.businesses b on b.id=m.business_id
    where m.user_id=auth.uid() and m.role in ('owner','admin') and b.active order by m.created_at,m.id limit 1;
  if current_business is distinct from p_business_id then raise exception 'reservation_series_forbidden' using errcode='42501'; end if;
  if p_repeat_count is null or p_repeat_count not between 2 and 260 or jsonb_typeof(p_payload->'complementary') is distinct from 'object'
    then raise exception 'reservation_series_invalid' using errcode='22023'; end if;
  if p_payload ? 'primary' then raise exception 'reservation_series_complementary_only' using errcode='22023'; end if;
  first_date := (p_payload->'complementary'->>'date')::date;
  v_option_id := (p_payload->'complementary'->>'option_id')::uuid;
  mode := (p_payload->'complementary'->>'occupancy_mode')::public.booking_group_occupancy_mode;
  start_at := nullif(p_payload->'complementary'->>'start_time','')::time;
  end_at := nullif(p_payload->'complementary'->>'end_time','')::time;
  if first_date is null or first_date < (now() at time zone 'America/Sao_Paulo')::date
    then raise exception 'reservation_series_invalid' using errcode='22023'; end if;
  select o.name into option_name from public.booking_options o join public.booking_groups g on g.id=o.group_id and g.business_id=o.business_id
    where o.id=v_option_id and o.business_id=p_business_id and o.active and g.active and g.position=3 and g.occupancy_mode=mode;
  if not found then raise exception 'reservation_complementary_option_invalid' using errcode='22023'; end if;
  -- Uses the same day/time shape and cross-midnight interpretation as individual allocations.
  perform private.complementary_period(mode,first_date,start_at,end_at);
  -- Acquire all incumbent date locks in ascending order before preflight/writes.
  perform 1 from public.business_settings where business_id=p_business_id for share;
  perform 1 from public.booking_options where business_id=p_business_id and id=v_option_id order by id for share;
  for i in 0..p_repeat_count-1 loop
    occurrence_date := first_date+i*7;
    perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||':'||occurrence_date::text,0));
    perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||':'||v_option_id::text||':'||occurrence_date::text,0));
  end loop;
  for i in 0..p_repeat_count-1 loop
    occurrence_date := first_date+i*7;
    if exists(select 1 from public.resource_allocations a where a.business_id=p_business_id and a.option_id=v_option_id and a.active
      and a.occupied_period && private.complementary_period(mode,occurrence_date,start_at,end_at)) then
      conflicts := conflicts || jsonb_build_array(jsonb_build_object('date',occurrence_date,'resource',option_name,'startTime',start_at));
    end if;
  end loop;
  if jsonb_array_length(conflicts)>0 then raise exception 'reservation_series_conflict' using errcode='23P01',detail=conflicts::text; end if;
  insert into public.reservation_series(business_id,starts_on,repeat_count,created_by) values(p_business_id,first_date,p_repeat_count,auth.uid()) returning id into v_series_id;
  for i in 0..p_repeat_count-1 loop
    occurrence_date := first_date+i*7;
    occurrence := jsonb_set(p_payload,'{complementary,date}',to_jsonb(occurrence_date));
    begin
      result := public.create_admin_reservation(occurrence);
    exception when exclusion_violation then
      raise exception 'reservation_series_conflict' using errcode='23P01',detail=jsonb_build_array(jsonb_build_object('date',occurrence_date,'resource','Recurso selecionado'))::text;
    end;
    update public.reservations set series_id=v_series_id,series_date=occurrence_date where id=(result->>'reservation_id')::uuid;
  end loop;
  return jsonb_build_object('series_id',v_series_id,'count',p_repeat_count);
end $$;

-- Deferred series cancellation has no application callers and is not exposed in this MVP.
revoke execute on function public.cancel_admin_reservation_series(uuid,uuid,text) from public,anon,authenticated;
