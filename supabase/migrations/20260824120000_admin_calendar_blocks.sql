-- Administrative calendar blocks and weekly block series.

create table public.calendar_block_series (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  group_1_option_id uuid,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  starts_on date not null,
  repeat_count integer check (repeat_count is null or repeat_count >= 2),
  reason text check (reason is null or char_length(trim(reason)) between 1 and 160),
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_block_series_time_order check (start_time < end_time),
  constraint calendar_block_series_weekday_matches_start check (
    weekday = extract(dow from starts_on)::smallint
  ),
  constraint calendar_block_series_id_business_unique unique (id, business_id),
  constraint calendar_block_series_group_1_tenant_fk
    foreign key (group_1_option_id, business_id)
    references public.booking_options (id, business_id)
);

create table public.calendar_blocks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  group_1_option_id uuid,
  block_date date not null,
  start_time time not null,
  end_time time not null,
  reason text check (reason is null or char_length(trim(reason)) between 1 and 160),
  series_id uuid,
  cancelled_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resource_id uuid generated always as (coalesce(group_1_option_id, business_id)) stored,
  block_period tsrange generated always as (
    tsrange(block_date + start_time, block_date + end_time, '[)')
  ) stored,
  constraint calendar_blocks_time_order check (start_time < end_time),
  constraint calendar_blocks_group_1_tenant_fk
    foreign key (group_1_option_id, business_id)
    references public.booking_options (id, business_id),
  constraint calendar_blocks_series_tenant_fk
    foreign key (series_id, business_id)
    references public.calendar_block_series (id, business_id)
    on delete restrict,
  constraint calendar_blocks_no_overlap
    exclude using gist (
      business_id with =,
      resource_id with =,
      block_period with &&
    ) where (cancelled_at is null)
);

create unique index calendar_blocks_series_date_unique
  on public.calendar_blocks (series_id, block_date)
  where series_id is not null;
create index calendar_blocks_business_date_idx
  on public.calendar_blocks (business_id, block_date, start_time)
  where cancelled_at is null;
create index calendar_block_series_active_idx
  on public.calendar_block_series (business_id, active, starts_on)
  where active;

create trigger calendar_blocks_set_updated_at
before update on public.calendar_blocks
for each row execute function private.set_updated_at();

create trigger calendar_block_series_set_updated_at
before update on public.calendar_block_series
for each row execute function private.set_updated_at();

alter table public.calendar_blocks enable row level security;
alter table public.calendar_block_series enable row level security;

revoke all on table public.calendar_blocks, public.calendar_block_series from anon, authenticated;
grant select on table public.calendar_blocks, public.calendar_block_series to authenticated;

create policy calendar_blocks_select_member_or_platform_admin
on public.calendar_blocks for select to authenticated
using ((select private.is_platform_admin()) or (select private.is_business_member(business_id)));

create policy calendar_block_series_select_member_or_platform_admin
on public.calendar_block_series for select to authenticated
using ((select private.is_platform_admin()) or (select private.is_business_member(business_id)));

create or replace function private.calendar_interval_is_available(
  p_business_id uuid,
  p_group_1_option_id uuid,
  p_date date,
  p_start_time time,
  p_end_time time,
  p_exclude_block_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_start_time < p_end_time
    and exists (
      select 1 from public.business_hours hour
      where hour.business_id = p_business_id
        and hour.weekday = extract(dow from p_date)::integer
        and hour.active
        and p_start_time >= hour.start_time
        and p_end_time <= hour.end_time
    )
    and not exists (
      select 1 from public.appointments appointment
      where appointment.business_id = p_business_id
        and appointment.appointment_date = p_date
        and appointment.status <> 'cancelled'::public.appointment_status
        and coalesce(appointment.group_1_option_id, appointment.business_id)
          = coalesce(p_group_1_option_id, p_business_id)
        and appointment.start_time < p_end_time
        and appointment.end_time > p_start_time
    )
    and not exists (
      select 1 from public.calendar_blocks block
      where block.business_id = p_business_id
        and block.block_date = p_date
        and block.cancelled_at is null
        and (p_exclude_block_id is null or block.id <> p_exclude_block_id)
        and block.resource_id = coalesce(p_group_1_option_id, p_business_id)
        and block.start_time < p_end_time
        and block.end_time > p_start_time
    );
$$;

revoke all on function private.calendar_interval_is_available(uuid, uuid, date, time, time, uuid) from public;

-- Keep the existing engine as the source of business rules, then filter its
-- slots through calendar blocks. Every existing caller continues using the
-- same private.get_booking_availability signature.
alter function private.get_booking_availability(text, date, uuid, uuid, uuid)
rename to get_booking_availability_without_calendar_blocks;

create function private.get_booking_availability(
  p_slug text,
  p_date date,
  p_group_1_option_id uuid,
  p_group_2_option_id uuid,
  p_exclude_appointment_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  selected_business_id uuid;
  raw_slots jsonb;
  slot jsonb;
  start_at time;
  duration integer;
  max_blocks integer;
  allowed_blocks integer;
  result jsonb := '[]'::jsonb;
begin
  select id into selected_business_id
  from public.businesses
  where slug = lower(trim(p_slug)) and active;
  if selected_business_id is null then return '[]'::jsonb; end if;

  raw_slots := private.get_booking_availability_without_calendar_blocks(
    p_slug, p_date, p_group_1_option_id, p_group_2_option_id,
    p_exclude_appointment_id
  );

  for slot in select value from jsonb_array_elements(raw_slots)
  loop
    start_at := (slot ->> 'start_time')::time;
    duration := (slot ->> 'duration_minutes')::integer;
    max_blocks := (slot ->> 'max_blocks')::integer;
    allowed_blocks := 0;
    for candidate_blocks in reverse max_blocks..1 loop
      if not exists (
        select 1 from public.calendar_blocks block
        where block.business_id = selected_business_id
          and block.block_date = p_date
          and block.cancelled_at is null
          and block.resource_id = coalesce(p_group_1_option_id, selected_business_id)
          and block.start_time < (p_date + start_at + make_interval(mins => duration * candidate_blocks))::time
          and block.end_time > start_at
      ) then
        allowed_blocks := candidate_blocks;
        exit;
      end if;
    end loop;
    if allowed_blocks > 0 then
      result := result || jsonb_build_array(slot || jsonb_build_object('max_blocks', allowed_blocks));
    end if;
  end loop;
  return result;
end;
$$;

revoke all on function private.get_booking_availability(text, date, uuid, uuid, uuid) from public;

create or replace function private.validate_calendar_block_resource(
  p_business_id uuid,
  p_group_1_option_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare group_1_active boolean;
begin
  select exists (
    select 1 from public.booking_groups
    where business_id = p_business_id and position = 1 and active
  ) into group_1_active;
  if group_1_active and not exists (
    select 1 from public.booking_options option
    join public.booking_groups booking_group on booking_group.id = option.group_id
    where option.id = p_group_1_option_id and option.business_id = p_business_id
      and option.active and booking_group.active and booking_group.position = 1
  ) then raise exception 'calendar_block_invalid_resource' using errcode = '22023'; end if;
  if not group_1_active and p_group_1_option_id is not null then
    raise exception 'calendar_block_invalid_resource' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.materialize_calendar_blocks(
  p_series_id uuid,
  p_horizon_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected public.calendar_block_series%rowtype;
  effective_horizon date;
  occurrence record;
  conflicts jsonb := '[]'::jsonb;
  created_count integer := 0;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  select series.* into selected from public.calendar_block_series series
  where series.id = p_series_id
    and private.has_business_role(series.business_id, array['owner','admin']::public.business_role[])
  for update;
  if not found then raise exception 'calendar_block_not_found' using errcode = '42501'; end if;
  if not selected.active then return jsonb_build_object('created_count', 0, 'active', false); end if;
  perform pg_advisory_xact_lock(hashtextextended('calendar-block-series:' || selected.id::text, 0));
  effective_horizon := case when selected.repeat_count is null
    then least(coalesce(p_horizon_date, current_date + 90), current_date + 90)
    else selected.starts_on + ((selected.repeat_count - 1) * 7) end;

  for occurrence in
    select selected.starts_on + ((number - 1) * 7) as block_date
    from generate_series(1, case when selected.repeat_count is null
      then greatest(0, ((effective_horizon - selected.starts_on) / 7) + 1)
      else selected.repeat_count end) number
    where selected.starts_on + ((number - 1) * 7) <= effective_horizon
      and not exists (select 1 from public.calendar_blocks block
        where block.series_id = selected.id
          and block.block_date = selected.starts_on + ((number - 1) * 7))
  loop
    if not private.calendar_interval_is_available(selected.business_id, selected.group_1_option_id,
      occurrence.block_date, selected.start_time, selected.end_time, null) then
      conflicts := conflicts || jsonb_build_array(jsonb_build_object(
        'date', occurrence.block_date, 'start_time', to_char(selected.start_time, 'HH24:MI')));
    end if;
  end loop;
  if jsonb_array_length(conflicts) > 0 then
    raise exception 'calendar_block_conflicts:%', conflicts::text using errcode = '23P01', detail = conflicts::text;
  end if;

  insert into public.calendar_blocks (business_id, group_1_option_id, block_date, start_time, end_time, reason, series_id, created_by)
  select selected.business_id, selected.group_1_option_id,
    selected.starts_on + ((number - 1) * 7), selected.start_time, selected.end_time,
    selected.reason, selected.id, selected.created_by
  from generate_series(1, case when selected.repeat_count is null
    then greatest(0, ((effective_horizon - selected.starts_on) / 7) + 1)
    else selected.repeat_count end) number
  where selected.starts_on + ((number - 1) * 7) <= effective_horizon
  on conflict (series_id, block_date) where series_id is not null do nothing;
  get diagnostics created_count = row_count;
  return jsonb_build_object('series_id', selected.id, 'created_count', created_count,
    'materialized_through', effective_horizon, 'active', true);
end;
$$;

create or replace function public.create_calendar_blocks(
  p_group_1_option_ids uuid[],
  p_date date,
  p_start_time time,
  p_end_time time,
  p_reason text default null,
  p_recurring boolean default false,
  p_repeat_count integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  selected_business_id uuid;
  resource_id uuid;
  resources uuid[];
  new_series_id uuid;
  new_block_id uuid;
  created_ids jsonb := '[]'::jsonb;
begin
  if current_user_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_date is null or p_start_time is null or p_end_time is null or p_start_time >= p_end_time
    or p_date < current_date then raise exception 'calendar_block_invalid_interval' using errcode = '22023'; end if;
  if p_recurring and p_repeat_count is not null and p_repeat_count < 2 then
    raise exception 'calendar_block_invalid_repeat_count' using errcode = '22023'; end if;
  select membership.business_id into selected_business_id
  from public.business_members membership join public.businesses business on business.id = membership.business_id
  where membership.user_id = current_user_id and membership.role in ('owner','admin') and business.active
  order by membership.created_at, membership.id limit 1;
  if selected_business_id is null then raise exception 'calendar_block_forbidden' using errcode = '42501'; end if;
  resources := case when coalesce(array_length(p_group_1_option_ids, 1), 0) = 0 then array[null::uuid]
    else array(select distinct value from unnest(p_group_1_option_ids) value) end;

  foreach resource_id in array resources loop
    perform private.validate_calendar_block_resource(selected_business_id, resource_id);
    if not p_recurring then
      if not private.calendar_interval_is_available(selected_business_id, resource_id, p_date, p_start_time, p_end_time, null) then
        raise exception 'calendar_block_conflicts:[{"date":"%","start_time":"%"}]', p_date, to_char(p_start_time,'HH24:MI') using errcode = '23P01';
      end if;
      insert into public.calendar_blocks (business_id, group_1_option_id, block_date, start_time, end_time, reason, created_by)
      values (selected_business_id, resource_id, p_date, p_start_time, p_end_time, nullif(trim(p_reason),''), current_user_id)
      returning id into new_block_id;
      created_ids := created_ids || jsonb_build_array(new_block_id);
    else
      insert into public.calendar_block_series (business_id, group_1_option_id, weekday, start_time, end_time,
        starts_on, repeat_count, reason, created_by)
      values (selected_business_id, resource_id, extract(dow from p_date)::smallint, p_start_time, p_end_time,
        p_date, p_repeat_count, nullif(trim(p_reason),''), current_user_id)
      returning id into new_series_id;
      perform public.materialize_calendar_blocks(new_series_id, null);
      created_ids := created_ids || jsonb_build_array(new_series_id);
    end if;
  end loop;
  return jsonb_build_object('ids', created_ids, 'recurring', p_recurring);
exception when exclusion_violation then
  raise exception 'calendar_block_conflict' using errcode = '23P01';
end;
$$;

create or replace function public.update_calendar_block(
  p_block_id uuid, p_date date, p_start_time time, p_end_time time, p_reason text default null
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare selected public.calendar_blocks%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  select block.* into selected from public.calendar_blocks block
  where block.id = p_block_id and block.cancelled_at is null
    and private.has_business_role(block.business_id, array['owner','admin']::public.business_role[])
  for update;
  if not found then raise exception 'calendar_block_not_found' using errcode = '42501'; end if;
  if not private.calendar_interval_is_available(selected.business_id, selected.group_1_option_id,
    p_date, p_start_time, p_end_time, selected.id) then
    raise exception 'calendar_block_conflict' using errcode = '23P01';
  end if;
  update public.calendar_blocks set block_date = p_date, start_time = p_start_time,
    end_time = p_end_time, reason = nullif(trim(p_reason),'') where id = selected.id;
  return true;
exception when exclusion_violation then raise exception 'calendar_block_conflict' using errcode = '23P01'; end;
$$;

create or replace function public.delete_calendar_block(p_block_id uuid, p_scope text default 'single')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare selected public.calendar_blocks%rowtype; affected integer := 0;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_scope not in ('single','future') then raise exception 'calendar_block_invalid_scope' using errcode = '22023'; end if;
  select block.* into selected from public.calendar_blocks block
  where block.id = p_block_id and block.cancelled_at is null
    and private.has_business_role(block.business_id, array['owner','admin']::public.business_role[])
  for update;
  if not found then raise exception 'calendar_block_not_found' using errcode = '42501'; end if;
  if p_scope = 'future' and selected.series_id is not null then
    update public.calendar_block_series set active = false where id = selected.series_id;
    update public.calendar_blocks set cancelled_at = now()
    where series_id = selected.series_id and cancelled_at is null
      and (block_date, start_time) >= (selected.block_date, selected.start_time);
  else
    update public.calendar_blocks set cancelled_at = now() where id = selected.id;
  end if;
  get diagnostics affected = row_count;
  return jsonb_build_object('scope', p_scope, 'affected', affected);
end;
$$;

revoke all on function public.create_calendar_blocks(uuid[], date, time, time, text, boolean, integer) from public;
revoke all on function public.materialize_calendar_blocks(uuid, date) from public;
revoke all on function public.update_calendar_block(uuid, date, time, time, text) from public;
revoke all on function public.delete_calendar_block(uuid, text) from public;
grant execute on function public.create_calendar_blocks(uuid[], date, time, time, text, boolean, integer) to authenticated;
grant execute on function public.materialize_calendar_blocks(uuid, date) to authenticated;
grant execute on function public.update_calendar_block(uuid, date, time, time, text) to authenticated;
grant execute on function public.delete_calendar_block(uuid, text) to authenticated;

comment on table public.calendar_blocks is 'Operational administrative blocks. A null Group 1 uses the business as the single resource.';
comment on table public.calendar_block_series is 'Weekly administrative block definitions; null repeat_count means permanent with a rolling 90-day horizon.';
comment on function private.calendar_interval_is_available(uuid, uuid, date, time, time, uuid) is 'Shared interval rule for block creation: one business-hours window, no active appointment, and no active block for the same resource.';
