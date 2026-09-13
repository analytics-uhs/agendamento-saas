-- Finite aggregate recurrence; occupancy remains in the incumbent Admin engine.
create table public.reservation_series (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  starts_on date not null,
  repeat_count integer not null check (repeat_count between 2 and 260),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(id,business_id)
);
alter table public.reservation_series enable row level security;
revoke all on public.reservation_series from public,anon,authenticated;
grant select on public.reservation_series to authenticated;
create policy reservation_series_read on public.reservation_series for select to authenticated
  using (private.is_business_member(business_id) or private.is_platform_admin());
alter table public.reservations add column series_id uuid, add column series_date date,
  add constraint reservations_series_tenant_fk foreign key(series_id,business_id) references public.reservation_series(id,business_id),
  add constraint reservations_series_shape check ((series_id is null) = (series_date is null));
create unique index reservations_series_date_unique on public.reservations(series_id,series_date) where series_id is not null;

create function public.create_admin_reservation_series(p_business_id uuid,p_payload jsonb,p_repeat_count integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  current_business uuid; first_date date; occurrence_date date; occurrence jsonb; result jsonb;
  v_series_id uuid; v_option_id uuid; mode public.booking_group_occupancy_mode; option_name text;
  start_at time; end_at time; primary_option uuid; secondary_option uuid; primary_start time;
  blocks integer; slot jsonb; conflicts jsonb := '[]'; period tsrange; i integer;
begin
  if auth.uid() is null or not private.has_business_role(p_business_id,array['owner','admin']::public.business_role[])
    then raise exception 'reservation_series_forbidden' using errcode='42501'; end if;
  -- Match the current incumbent engine's business selection; never mutate a different tenant.
  select m.business_id into current_business from public.business_members m join public.businesses b on b.id=m.business_id
    where m.user_id=auth.uid() and m.role in ('owner','admin') and b.active order by m.created_at,m.id limit 1;
  if current_business is distinct from p_business_id then raise exception 'reservation_series_forbidden' using errcode='42501'; end if;
  if p_repeat_count is null or p_repeat_count not between 2 and 260 or jsonb_typeof(p_payload->'complementary') is distinct from 'object'
    then raise exception 'reservation_series_invalid' using errcode='22023'; end if;
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
  period := private.complementary_period(mode,first_date,start_at,end_at);
  if p_payload?'primary' then
    if (p_payload->'primary'->>'date')::date is distinct from first_date then raise exception 'reservation_components_date_mismatch' using errcode='22023'; end if;
    primary_option := nullif(p_payload->'primary'->>'group_1_option_id','')::uuid;
    secondary_option := nullif(p_payload->'primary'->>'group_2_option_id','')::uuid;
    primary_start := (p_payload->'primary'->>'start_time')::time;
    blocks := coalesce((p_payload->'primary'->>'blocks')::integer,1);
    if primary_start is null or blocks<1 then raise exception 'reservation_series_invalid' using errcode='22023'; end if;
  end if;
  -- Acquire all incumbent date locks in ascending order before preflight/writes.
  perform 1 from public.business_settings where business_id=p_business_id for share;
  perform 1 from public.booking_options where business_id=p_business_id and id in (v_option_id,primary_option,secondary_option) order by id for share;
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
    if p_payload?'primary' then
      select value into slot from jsonb_array_elements(private.get_primary_booking_availability(p_business_id,occurrence_date,primary_option,secondary_option,null,false,true))
        where (value->>'start_time')::time=primary_start and (value->>'max_blocks')::integer>=blocks limit 1;
      if slot is null then conflicts := conflicts || jsonb_build_array(jsonb_build_object('date',occurrence_date,
        'resource',coalesce((select name from public.booking_options where id=primary_option and business_id=p_business_id),'Grupo principal'),'startTime',primary_start)); end if;
    end if;
  end loop;
  if jsonb_array_length(conflicts)>0 then raise exception 'reservation_series_conflict' using errcode='23P01',detail=conflicts::text; end if;
  insert into public.reservation_series(business_id,starts_on,repeat_count,created_by) values(p_business_id,first_date,p_repeat_count,auth.uid()) returning id into v_series_id;
  for i in 0..p_repeat_count-1 loop
    occurrence_date := first_date+i*7;
    occurrence := jsonb_set(p_payload,'{complementary,date}',to_jsonb(occurrence_date));
    if p_payload?'primary' then occurrence:=jsonb_set(occurrence,'{primary,date}',to_jsonb(occurrence_date)); end if;
    begin
      result := public.create_admin_reservation(occurrence);
    exception when exclusion_violation then
      raise exception 'reservation_series_conflict' using errcode='23P01',detail=jsonb_build_array(jsonb_build_object('date',occurrence_date,'resource','Recurso selecionado'))::text;
    end;
    update public.reservations set series_id=v_series_id,series_date=occurrence_date where id=(result->>'reservation_id')::uuid;
  end loop;
  return jsonb_build_object('series_id',v_series_id,'count',p_repeat_count);
end $$;

create function public.cancel_admin_reservation_series(p_business_id uuid,p_reservation_id uuid,p_scope text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare selected public.reservations; item record; affected integer:=0;
begin
  if auth.uid() is null or not private.has_business_role(p_business_id,array['owner','admin']::public.business_role[])
    then raise exception 'reservation_series_forbidden' using errcode='42501'; end if;
  if p_scope is null or p_scope not in ('single','future') then raise exception 'recurring_invalid_cancel_scope' using errcode='22023'; end if;
  select * into selected from public.reservations where id=p_reservation_id and business_id=p_business_id;
  if not found or selected.series_id is null then raise exception 'reservation_series_forbidden' using errcode='42501'; end if;
  perform 1 from public.reservation_series where id=selected.series_id and business_id=p_business_id for update;
  for item in select id from public.reservations where series_id=selected.series_id and business_id=p_business_id
    and (id=selected.id or (p_scope='future' and series_date>=selected.series_date)) order by series_date,id for update loop
    perform public.cancel_admin_reservation(item.id);
    affected:=affected+1;
  end loop;
  return jsonb_build_object('count',affected);
end $$;
revoke all on function public.create_admin_reservation_series(uuid,jsonb,integer),public.cancel_admin_reservation_series(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.create_admin_reservation_series(uuid,jsonb,integer),public.cancel_admin_reservation_series(uuid,uuid,text) to authenticated;
