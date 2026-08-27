-- Complementary resource blocks share the same allocation barrier as reservations.

create table public.resource_block_series (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  group_id uuid not null,
  option_id uuid not null,
  occupancy_mode public.booking_group_occupancy_mode not null,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time,
  end_time time,
  starts_on date not null,
  repeat_count integer check (repeat_count is null or repeat_count >= 2),
  reason text check (reason is null or char_length(pg_catalog.btrim(reason)) between 1 and 160),
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resource_block_series_id_business_unique unique (id, business_id),
  constraint resource_block_series_group_tenant_fk foreign key (group_id, business_id)
    references public.booking_groups (id, business_id) on delete restrict,
  constraint resource_block_series_option_tenant_fk foreign key (option_id, business_id)
    references public.booking_options (id, business_id) on delete restrict,
  constraint resource_block_series_weekday_matches_start check (
    weekday = extract(dow from starts_on)::smallint
  ),
  constraint resource_block_series_occupancy_shape_check check (
    (occupancy_mode = 'day' and start_time is null and end_time is null)
    or (occupancy_mode = 'time_slot' and start_time is not null and end_time is not null and start_time < end_time)
  )
);

create table public.resource_blocks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  group_id uuid not null,
  option_id uuid not null,
  occupancy_mode public.booking_group_occupancy_mode not null,
  block_date date not null,
  start_time time,
  end_time time,
  reason text check (reason is null or char_length(pg_catalog.btrim(reason)) between 1 and 160),
  series_id uuid,
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resource_blocks_id_business_unique unique (id, business_id),
  constraint resource_blocks_group_tenant_fk foreign key (group_id, business_id)
    references public.booking_groups (id, business_id) on delete restrict,
  constraint resource_blocks_option_tenant_fk foreign key (option_id, business_id)
    references public.booking_options (id, business_id) on delete restrict,
  constraint resource_blocks_series_tenant_fk foreign key (series_id, business_id)
    references public.resource_block_series (id, business_id) on delete restrict,
  constraint resource_blocks_occupancy_shape_check check (
    (occupancy_mode = 'day' and start_time is null and end_time is null)
    or (occupancy_mode = 'time_slot' and start_time is not null and end_time is not null and start_time < end_time)
  )
);

create unique index resource_blocks_series_date_unique
  on public.resource_blocks (series_id, block_date) where series_id is not null;
create index resource_blocks_business_date_idx
  on public.resource_blocks (business_id, block_date, start_time) where active;
create index resource_block_series_active_idx
  on public.resource_block_series (business_id, active, starts_on) where active;

alter table public.resource_allocations
  alter column reservation_resource_id drop not null,
  add column resource_block_id uuid,
  add constraint resource_allocations_block_unique unique (resource_block_id),
  add constraint resource_allocations_block_tenant_fk
    foreign key (resource_block_id, business_id)
    references public.resource_blocks (id, business_id) on delete cascade,
  add constraint resource_allocations_single_source_check check (
    pg_catalog.num_nonnulls(reservation_resource_id, resource_block_id) = 1
  );

create trigger resource_block_series_00_normalize_midnight_end
before insert or update of start_time, end_time on public.resource_block_series
for each row execute function private.normalize_midnight_end_time();

create trigger resource_blocks_00_normalize_midnight_end
before insert or update of start_time, end_time on public.resource_blocks
for each row execute function private.normalize_midnight_end_time();

create trigger resource_block_series_set_updated_at
before update on public.resource_block_series
for each row execute function private.set_updated_at();

create trigger resource_blocks_set_updated_at
before update on public.resource_blocks
for each row execute function private.set_updated_at();

create or replace function private.validate_complementary_block_catalog()
returns trigger language plpgsql set search_path = '' as $$
declare selected_group record;
begin
  select booking_group.occupancy_mode, booking_group.active
  into selected_group
  from public.booking_groups booking_group
  where booking_group.id = new.group_id
    and booking_group.business_id = new.business_id
    and booking_group.position = 3;
  if not found then raise exception 'resource_block_group_invalid' using errcode = '23514'; end if;
  if tg_op = 'INSERT' and not selected_group.active then
    raise exception 'resource_block_group_inactive' using errcode = '22023';
  end if;
  if new.occupancy_mode is distinct from selected_group.occupancy_mode then
    raise exception 'resource_block_occupancy_mode_invalid' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.booking_options option
    where option.id = new.option_id and option.business_id = new.business_id
      and option.group_id = new.group_id and (tg_op <> 'INSERT' or option.active)
  ) then raise exception 'resource_block_option_invalid' using errcode = '22023'; end if;
  return new;
end;
$$;

create trigger resource_block_series_validate
before insert or update on public.resource_block_series
for each row execute function private.validate_complementary_block_catalog();

create trigger resource_blocks_validate
before insert or update on public.resource_blocks
for each row execute function private.validate_complementary_block_catalog();

create or replace function private.sync_resource_block_allocation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.resource_allocations (
      business_id, option_id, resource_block_id, occupancy_mode,
      allocation_date, start_time, end_time, active
    ) values (
      new.business_id, new.option_id, new.id, new.occupancy_mode,
      new.block_date, new.start_time, new.end_time, new.active
    );
  elsif new.active is distinct from old.active then
    update public.resource_allocations set active = new.active
    where resource_block_id = new.id and business_id = new.business_id;
    if not found then raise exception 'resource_block_allocation_missing' using errcode = '23503'; end if;
  end if;
  return new;
end;
$$;

create trigger resource_blocks_sync_allocation
after insert or update of active on public.resource_blocks
for each row execute function private.sync_resource_block_allocation();

alter table public.resource_blocks enable row level security;
alter table public.resource_block_series enable row level security;
revoke all on table public.resource_blocks, public.resource_block_series from public, anon, authenticated;
grant select on table public.resource_blocks, public.resource_block_series to authenticated;

create policy resource_blocks_select_member_or_platform_admin
on public.resource_blocks for select to authenticated
using ((select private.is_platform_admin()) or (select private.is_business_member(business_id)));

create policy resource_block_series_select_member_or_platform_admin
on public.resource_block_series for select to authenticated
using ((select private.is_platform_admin()) or (select private.is_business_member(business_id)));

create or replace function public.materialize_resource_blocks(
  p_series_id uuid, p_horizon_date date default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare selected public.resource_block_series%rowtype; effective_horizon date; occurrence_date date; created_count integer := 0;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  select series.* into selected from public.resource_block_series series
  where series.id = p_series_id
    and private.has_business_role(series.business_id, array['owner','admin']::public.business_role[])
  for update;
  if not found then raise exception 'resource_block_not_found' using errcode = '42501'; end if;
  if not selected.active then return jsonb_build_object('created_count', 0, 'active', false); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('resource-block-series:' || selected.id::text, 0));
  effective_horizon := case when selected.repeat_count is null
    then least(coalesce(p_horizon_date, current_date + 90), current_date + 90)
    else selected.starts_on + ((selected.repeat_count - 1) * 7) end;
  for occurrence_date in
    select selected.starts_on + ((number - 1) * 7)
    from pg_catalog.generate_series(1, case when selected.repeat_count is null
      then greatest(0, ((effective_horizon - selected.starts_on) / 7) + 1)
      else selected.repeat_count end) number
    where selected.starts_on + ((number - 1) * 7) <= effective_horizon
      and not exists (select 1 from public.resource_blocks block
        where block.series_id = selected.id and block.block_date = selected.starts_on + ((number - 1) * 7))
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      selected.business_id::text || ':' || selected.option_id::text || ':' || occurrence_date::text, 0));
    insert into public.resource_blocks (
      business_id, group_id, option_id, occupancy_mode, block_date,
      start_time, end_time, reason, series_id, created_by
    ) values (
      selected.business_id, selected.group_id, selected.option_id, selected.occupancy_mode,
      occurrence_date, selected.start_time, selected.end_time, selected.reason, selected.id, selected.created_by
    );
    created_count := created_count + 1;
  end loop;
  return jsonb_build_object('series_id', selected.id, 'created_count', created_count,
    'materialized_through', effective_horizon, 'active', true);
exception when exclusion_violation then
  raise exception 'resource_block_conflict' using errcode = '23P01';
end;
$$;

create or replace function public.create_admin_resource_blocks(
  p_option_ids uuid[], p_date date, p_start_time time default null, p_end_time time default null,
  p_reason text default null, p_recurring boolean default false, p_repeat_count integer default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid(); selected_business_id uuid; selected_group record;
  option_id uuid; option_ids uuid[]; new_block_id uuid; new_series_id uuid; created_ids jsonb := '[]'::jsonb;
begin
  if current_user_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_date is null or p_date < current_date or coalesce(pg_catalog.array_length(p_option_ids, 1), 0) = 0 then
    raise exception 'resource_block_invalid_input' using errcode = '22023'; end if;
  if p_recurring and p_repeat_count is not null and p_repeat_count < 2 then
    raise exception 'resource_block_invalid_repeat_count' using errcode = '22023'; end if;
  select membership.business_id into selected_business_id
  from public.business_members membership join public.businesses business on business.id = membership.business_id
  where membership.user_id = current_user_id and membership.role in ('owner','admin') and business.active
  order by membership.created_at, membership.id limit 1;
  if selected_business_id is null then raise exception 'resource_block_forbidden' using errcode = '42501'; end if;
  select booking_group.id, booking_group.occupancy_mode into selected_group
  from public.booking_groups booking_group
  where booking_group.business_id = selected_business_id and booking_group.position = 3 and booking_group.active;
  if not found then raise exception 'resource_block_group_inactive' using errcode = '22023'; end if;
  if selected_group.occupancy_mode = 'day' and (p_start_time is not null or p_end_time is not null) then
    raise exception 'resource_block_invalid_interval' using errcode = '22023'; end if;
  if selected_group.occupancy_mode = 'time_slot' and (
    p_start_time is null or p_end_time is null
    or p_start_time >= private.normalize_end_of_day_time(p_start_time, p_end_time)
  ) then raise exception 'resource_block_invalid_interval' using errcode = '22023'; end if;
  option_ids := array(select distinct value from pg_catalog.unnest(p_option_ids) value order by value);
  if exists (
    select 1 from pg_catalog.unnest(option_ids) requested(id)
    left join public.booking_options option on option.id = requested.id
      and option.business_id = selected_business_id and option.group_id = selected_group.id and option.active
    where option.id is null
  ) then raise exception 'resource_block_option_invalid' using errcode = '22023'; end if;
  foreach option_id in array option_ids loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      selected_business_id::text || ':' || option_id::text || ':' || p_date::text, 0));
    if p_recurring then
      insert into public.resource_block_series (
        business_id, group_id, option_id, occupancy_mode, weekday, start_time, end_time,
        starts_on, repeat_count, reason, created_by
      ) values (
        selected_business_id, selected_group.id, option_id, selected_group.occupancy_mode,
        extract(dow from p_date)::smallint, p_start_time, p_end_time,
        p_date, p_repeat_count, nullif(pg_catalog.btrim(p_reason), ''), current_user_id
      ) returning id into new_series_id;
      perform public.materialize_resource_blocks(new_series_id, null);
      created_ids := created_ids || jsonb_build_array(new_series_id);
    else
      insert into public.resource_blocks (
        business_id, group_id, option_id, occupancy_mode, block_date,
        start_time, end_time, reason, created_by
      ) values (
        selected_business_id, selected_group.id, option_id, selected_group.occupancy_mode,
        p_date, p_start_time, p_end_time, nullif(pg_catalog.btrim(p_reason), ''), current_user_id
      ) returning id into new_block_id;
      created_ids := created_ids || jsonb_build_array(new_block_id);
    end if;
  end loop;
  return jsonb_build_object('ids', created_ids, 'recurring', p_recurring);
exception when exclusion_violation then
  raise exception 'resource_block_conflict' using errcode = '23P01';
end;
$$;

create or replace function public.cancel_admin_resource_block(
  p_block_id uuid, p_scope text default 'single'
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare selected public.resource_blocks%rowtype; affected integer := 0;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_scope not in ('single','future') then raise exception 'resource_block_invalid_scope' using errcode = '22023'; end if;
  select block.* into selected from public.resource_blocks block
  where block.id = p_block_id and block.active
    and private.has_business_role(block.business_id, array['owner','admin']::public.business_role[])
  for update;
  if not found then raise exception 'resource_block_not_found' using errcode = '42501'; end if;
  if p_scope = 'future' and selected.series_id is not null then
    update public.resource_block_series set active = false where id = selected.series_id;
    update public.resource_blocks set active = false
    where series_id = selected.series_id and active
      and (block_date, coalesce(start_time, '00:00'::time)) >=
        (selected.block_date, coalesce(selected.start_time, '00:00'::time));
  else
    update public.resource_blocks set active = false where id = selected.id;
  end if;
  get diagnostics affected = row_count;
  return jsonb_build_object('scope', p_scope, 'affected', affected);
end;
$$;

revoke all on function private.validate_complementary_block_catalog() from public, anon, authenticated;
revoke all on function private.sync_resource_block_allocation() from public, anon, authenticated;
revoke all on function public.materialize_resource_blocks(uuid, date) from public, anon;
revoke all on function public.create_admin_resource_blocks(uuid[], date, time, time, text, boolean, integer) from public, anon;
revoke all on function public.cancel_admin_resource_block(uuid, text) from public, anon;
grant execute on function public.materialize_resource_blocks(uuid, date) to authenticated;
grant execute on function public.create_admin_resource_blocks(uuid[], date, time, time, text, boolean, integer) to authenticated;
grant execute on function public.cancel_admin_resource_block(uuid, text) to authenticated;

comment on table public.resource_blocks is 'Administrative complementary-resource blocks. day stores no synthetic times; active=false preserves history.';
comment on table public.resource_block_series is 'Weekly complementary block definitions; null repeat_count uses the shared rolling 90-day horizon.';
comment on column public.resource_allocations.resource_block_id is 'Exclusive allocation source for a complementary block; exactly one source FK is required.';
comment on function public.create_admin_resource_blocks(uuid[], date, time, time, text, boolean, integer) is 'Atomically blocks one or more active complementary options without bypassing the shared allocation exclusion constraint.';
comment on function public.cancel_admin_resource_block(uuid, text) is 'Cancels one occurrence or this-and-future occurrences and releases their allocations atomically.';
