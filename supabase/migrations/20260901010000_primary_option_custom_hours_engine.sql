-- Per-resource public schedules for primary booking options. Existing options
-- explicitly inherit business_hours; custom schedules replace (never
-- intersect or fall back to) the business schedule.

create type public.booking_option_schedule_mode as enum ('business', 'custom');

alter table public.booking_options
  add column schedule_mode public.booking_option_schedule_mode not null default 'business';

create table public.booking_option_hours (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  option_id uuid not null,
  weekday smallint not null check (weekday between 0 and 6),
  active boolean not null default true,
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_option_hours_option_tenant_fk
    foreign key (option_id, business_id)
    references public.booking_options (id, business_id)
    on delete cascade,
  constraint booking_option_hours_valid_window check (start_time < end_time),
  constraint booking_option_hours_window_unique
    unique (business_id, option_id, weekday, start_time, end_time)
);

create index booking_option_hours_lookup_idx
  on public.booking_option_hours (business_id, option_id, weekday, start_time)
  where active;

alter table public.booking_option_hours
  add constraint booking_option_hours_no_overlap
  exclude using gist (
    business_id with =,
    option_id with =,
    weekday with =,
    int4range(
      (extract(epoch from start_time) / 60)::integer,
      (extract(epoch from end_time) / 60)::integer,
      '[)'
    ) with &&
  ) where (active);

create trigger booking_option_hours_set_updated_at
before update on public.booking_option_hours
for each row execute function private.set_updated_at();

create trigger booking_option_hours_00_normalize_midnight_end
before insert or update of start_time, end_time on public.booking_option_hours
for each row execute function private.normalize_midnight_end_time();

create or replace function private.validate_primary_option_schedule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.schedule_mode = 'custom' and not exists (
    select 1
    from public.booking_groups booking_group
    where booking_group.id = new.group_id
      and booking_group.business_id = new.business_id
      and booking_group.position = 1
  ) then
    raise exception 'booking_option_custom_schedule_primary_only' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger booking_options_validate_primary_schedule
before insert or update of group_id, business_id, schedule_mode on public.booking_options
for each row execute function private.validate_primary_option_schedule();

create or replace function private.validate_primary_option_hour()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.booking_options booking_option
    join public.booking_groups booking_group
      on booking_group.id = booking_option.group_id
     and booking_group.business_id = booking_option.business_id
    where booking_option.id = new.option_id
      and booking_option.business_id = new.business_id
      and booking_group.position = 1
  ) then
    raise exception 'booking_option_hours_primary_only' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger booking_option_hours_validate_primary
before insert or update of business_id, option_id on public.booking_option_hours
for each row execute function private.validate_primary_option_hour();

alter table public.booking_option_hours enable row level security;
revoke all on table public.booking_option_hours from public, anon, authenticated;
grant select on table public.booking_option_hours to authenticated;

create policy booking_option_hours_select_member_or_platform_admin
on public.booking_option_hours for select to authenticated
using (
  (select private.is_platform_admin())
  or (select private.is_business_member(business_id))
);

create or replace function public.set_admin_booking_option_schedule(
  p_option_id uuid,
  p_schedule_mode public.booking_option_schedule_mode,
  p_hours jsonb default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  selected_option record;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select booking_option.id, booking_option.business_id
  into selected_option
  from public.booking_options booking_option
  join public.booking_groups booking_group
    on booking_group.id = booking_option.group_id
   and booking_group.business_id = booking_option.business_id
  where booking_option.id = p_option_id
    and booking_group.position = 1
  for update of booking_option;

  if not found or not (
    (select private.is_platform_admin())
    or (select private.has_business_role(
      selected_option.business_id,
      array['owner', 'admin']::public.business_role[]
    ))
  ) then
    raise exception 'booking_option_schedule_forbidden' using errcode = '42501';
  end if;

  if p_schedule_mode = 'business' then
    if p_hours is not null then
      raise exception 'booking_option_schedule_hours_unexpected' using errcode = '22023';
    end if;
    update public.booking_options set schedule_mode = 'business'
    where id = selected_option.id;
    -- Preserve custom rows for a future business -> custom switch.
    return true;
  end if;

  perform private.validate_business_hours_payload(p_hours);

  delete from public.booking_option_hours
  where business_id = selected_option.business_id
    and option_id = selected_option.id;

  insert into public.booking_option_hours (
    business_id, option_id, weekday, active, start_time, end_time
  )
  select
    selected_option.business_id,
    selected_option.id,
    (day ->> 'weekday')::smallint,
    true,
    (window_payload ->> 'start_time')::time,
    (window_payload ->> 'end_time')::time
  from jsonb_array_elements(p_hours) selected(day)
  cross join lateral jsonb_array_elements(day -> 'windows') selected_window(window_payload);

  update public.booking_options set schedule_mode = 'custom'
  where id = selected_option.id;
  return true;
end;
$$;

revoke all on function public.set_admin_booking_option_schedule(uuid, public.booking_option_schedule_mode, jsonb)
  from public, anon;
grant execute on function public.set_admin_booking_option_schedule(uuid, public.booking_option_schedule_mode, jsonb)
  to authenticated;

create or replace function private.get_effective_primary_option_hours(
  p_business_id uuid,
  p_group_1_option_id uuid,
  p_date date
)
returns table(start_time time, end_time time)
language sql
stable
security definer
set search_path = ''
as $$
  select selected.start_time, selected.end_time
  from (
    select business_hour.start_time, business_hour.end_time
    from public.business_hours business_hour
    where business_hour.business_id = p_business_id
      and business_hour.weekday = extract(dow from p_date)::integer
      and business_hour.active
      and (
        p_group_1_option_id is null
        or exists (
          select 1 from public.booking_options booking_option
          where booking_option.id = p_group_1_option_id
            and booking_option.business_id = p_business_id
            and booking_option.schedule_mode = 'business'
        )
      )
    union all
    select option_hour.start_time, option_hour.end_time
    from public.booking_option_hours option_hour
    join public.booking_options booking_option
      on booking_option.id = option_hour.option_id
     and booking_option.business_id = option_hour.business_id
    where option_hour.business_id = p_business_id
      and option_hour.option_id = p_group_1_option_id
      and option_hour.weekday = extract(dow from p_date)::integer
      and option_hour.active
      and booking_option.schedule_mode = 'custom'
  ) selected;
$$;

revoke all on function private.get_effective_primary_option_hours(uuid, uuid, date)
  from public, anon, authenticated;

create or replace function private.get_primary_booking_availability(
  p_business_id uuid,
  p_date date,
  p_group_1_option_id uuid,
  p_group_2_option_id uuid,
  p_exclude_appointment_id uuid default null,
  p_enforce_hours boolean default true,
  p_include_blocks boolean default true
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  selected_business record;
  selected_group_1 uuid;
  selected_group_2 uuid;
  group_1_active boolean;
  group_2_active boolean;
  base_duration integer;
  excluded_start time;
  local_now timestamp := pg_catalog.now() at time zone 'America/Sao_Paulo';
  result jsonb;
begin
  select business.id, settings.duration_mode, settings.fixed_duration_minutes
  into selected_business
  from public.businesses business
  join public.business_settings settings on settings.business_id = business.id
  where business.id = p_business_id and business.active;
  if not found or p_date is null then return '[]'::jsonb; end if;

  if p_exclude_appointment_id is not null then
    select appointment.start_time into excluded_start
    from public.appointments appointment
    where appointment.id = p_exclude_appointment_id
      and appointment.business_id = p_business_id
      and appointment.appointment_date = p_date;
  end if;
  if p_date < local_now::date and excluded_start is null then return '[]'::jsonb; end if;

  select exists (select 1 from public.booking_groups where business_id=p_business_id and position=1 and active)
    into group_1_active;
  select exists (select 1 from public.booking_groups where business_id=p_business_id and position=2 and active)
    into group_2_active;

  if group_1_active then
    select booking_option.id into selected_group_1
    from public.booking_options booking_option
    join public.booking_groups booking_group on booking_group.id=booking_option.group_id
    where booking_option.id=p_group_1_option_id and booking_option.business_id=p_business_id
      and booking_option.active and booking_group.active and booking_group.position=1;
    if not found then raise exception 'booking_invalid_group_1' using errcode='22023'; end if;
  elsif p_group_1_option_id is not null then
    raise exception 'booking_invalid_group_1' using errcode='22023';
  end if;

  if group_2_active then
    select booking_option.id into selected_group_2
    from public.booking_options booking_option
    join public.booking_groups booking_group on booking_group.id=booking_option.group_id
    where booking_option.id=p_group_2_option_id and booking_option.business_id=p_business_id
      and booking_option.active and booking_group.active and booking_group.position=2;
    if not found then raise exception 'booking_invalid_group_2' using errcode='22023'; end if;
  elsif p_group_2_option_id is not null then
    raise exception 'booking_invalid_group_2' using errcode='22023';
  end if;

  if selected_business.duration_mode='group_2' then
    if selected_group_2 is null then raise exception 'booking_group_2_duration_required' using errcode='22023'; end if;
    select duration_minutes into base_duration from public.booking_options where id=selected_group_2;
  else
    base_duration := selected_business.fixed_duration_minutes;
  end if;
  if base_duration is null or base_duration <= 0 then raise exception 'booking_invalid_duration' using errcode='22023'; end if;

  with effective_windows as (
    select * from private.get_effective_primary_option_hours(p_business_id, selected_group_1, p_date)
  ), anchors as (
    select p_date::timestamp anchor where not p_enforce_hours
    union
    select p_date + effective_window.start_time from effective_windows effective_window
  ), candidates as (
    select generated.candidate,
      case when p_enforce_hours then anchor_window.end_time else time '24:00' end window_end
    from anchors
    left join effective_windows anchor_window
      on anchor = p_date + anchor_window.start_time
    cross join lateral generate_series(
      anchor,
      p_date + (case when p_enforce_hours then anchor_window.end_time else time '24:00' end)
        - make_interval(mins=>base_duration),
      make_interval(mins=>base_duration)
    ) generated(candidate)
    where p_date > local_now::date or generated.candidate > local_now
      or (excluded_start is not null and generated.candidate::time=excluded_start)
  ), available as (
    select distinct candidate,
      case when selected_business.duration_mode='fixed_multiple' then (
        select max(block_count)
        from generate_series(1, floor(extract(epoch from ((p_date+window_end)-candidate))/60/base_duration)::integer) blocks(block_count)
        where not exists (
          select 1 from public.appointments appointment
          where appointment.business_id=p_business_id and appointment.appointment_date=p_date
            and appointment.status<>'cancelled'
            and (p_exclude_appointment_id is null or appointment.id<>p_exclude_appointment_id)
            and coalesce(appointment.group_1_option_id,appointment.business_id)=coalesce(selected_group_1,p_business_id)
            and appointment.start_time < private.normalize_end_of_day_time(candidate::time,(candidate+make_interval(mins=>base_duration*block_count))::time)
            and appointment.end_time > candidate::time
        ) and (not p_include_blocks or not exists (
          select 1 from public.calendar_blocks block
          where block.business_id=p_business_id and block.block_date=p_date and block.cancelled_at is null
            and block.resource_id=coalesce(selected_group_1,p_business_id)
            and block.start_time < private.normalize_end_of_day_time(candidate::time,(candidate+make_interval(mins=>base_duration*block_count))::time)
            and block.end_time > candidate::time
        ))
      ) else case when not exists (
        select 1 from public.appointments appointment
        where appointment.business_id=p_business_id and appointment.appointment_date=p_date
          and appointment.status<>'cancelled'
          and (p_exclude_appointment_id is null or appointment.id<>p_exclude_appointment_id)
          and coalesce(appointment.group_1_option_id,appointment.business_id)=coalesce(selected_group_1,p_business_id)
          and appointment.start_time < private.normalize_end_of_day_time(candidate::time,(candidate+make_interval(mins=>base_duration))::time)
          and appointment.end_time > candidate::time
      ) and (not p_include_blocks or not exists (
        select 1 from public.calendar_blocks block
        where block.business_id=p_business_id and block.block_date=p_date and block.cancelled_at is null
          and block.resource_id=coalesce(selected_group_1,p_business_id)
          and block.start_time < private.normalize_end_of_day_time(candidate::time,(candidate+make_interval(mins=>base_duration))::time)
          and block.end_time > candidate::time
      )) then 1 else 0 end end max_blocks
    from candidates
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'start_time',to_char(candidate,'HH24:MI'),'duration_minutes',base_duration,'max_blocks',max_blocks
  ) order by candidate),'[]'::jsonb) into result
  from available where max_blocks>0;
  return result;
end;
$$;

revoke all on function private.get_primary_booking_availability(uuid,date,uuid,uuid,uuid,boolean,boolean)
  from public, anon, authenticated;

create or replace function private.get_booking_availability_without_calendar_blocks(
  p_slug text,p_date date,p_group_1_option_id uuid,p_group_2_option_id uuid,p_exclude_appointment_id uuid default null
)
returns jsonb language sql stable security definer set search_path=''
as $$
  select private.get_primary_booking_availability(business.id,p_date,p_group_1_option_id,p_group_2_option_id,p_exclude_appointment_id,true,false)
  from public.businesses business
  where business.slug=lower(trim(p_slug)) and business.active;
$$;

create or replace function private.get_booking_availability(
  p_slug text,p_date date,p_group_1_option_id uuid,p_group_2_option_id uuid,p_exclude_appointment_id uuid default null
)
returns jsonb language sql stable security definer set search_path=''
as $$
  select private.get_primary_booking_availability(business.id,p_date,p_group_1_option_id,p_group_2_option_id,p_exclude_appointment_id,true,true)
  from public.businesses business
  where business.slug=lower(trim(p_slug)) and business.active;
$$;

create or replace function private.get_admin_booking_availability(
  p_business_id uuid,p_date date,p_group_1_option_id uuid,p_group_2_option_id uuid,p_exclude_appointment_id uuid default null
)
returns jsonb language sql stable security definer set search_path=''
as $$
  select private.get_primary_booking_availability(p_business_id,p_date,p_group_1_option_id,p_group_2_option_id,p_exclude_appointment_id,false,true);
$$;

create or replace function private.public_primary_interval_is_valid(
  p_business_id uuid,p_group_1_option_id uuid,p_date date,p_start_time time,p_duration_minutes integer,p_base_duration integer
)
returns boolean language sql stable security definer set search_path=''
as $$
  select exists (
    select 1
    from private.get_effective_primary_option_hours(p_business_id,p_group_1_option_id,p_date) effective_window
    where p_start_time>=effective_window.start_time
      and p_date+p_start_time+make_interval(mins=>p_duration_minutes)<=p_date+effective_window.end_time
      and mod((extract(epoch from ((p_date+p_start_time)-(p_date+effective_window.start_time)))/60)::integer,p_base_duration)=0
  );
$$;

revoke all on function private.public_primary_interval_is_valid(uuid,uuid,date,time,integer,integer)
  from public, anon, authenticated;

-- Keep the current public contract while validating against the effective
-- primary schedule rather than business_hours directly.
create or replace function public.create_public_appointment(
  p_slug text,p_group_1_option_id uuid,p_group_2_option_id uuid,p_date date,p_start_time time,
  p_blocks integer,p_customer_name text,p_customer_whatsapp text
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  selected_business record; selected_group_1 uuid; selected_group_2 uuid;
  group_1_label text; group_1_name text; group_2_label text; group_2_name text;
  group_1_active boolean; group_2_active boolean; base_duration integer; total_duration integer;
  calculated_end time; normalized_whatsapp text:=regexp_replace(coalesce(p_customer_whatsapp,''),'\D','','g');
  local_now timestamp:=now() at time zone 'America/Sao_Paulo'; available jsonb;
begin
  if char_length(trim(coalesce(p_customer_name,''))) not between 2 and 120 then raise exception 'booking_invalid_customer_name' using errcode='22023'; end if;
  if char_length(normalized_whatsapp) not between 10 and 15 then raise exception 'booking_invalid_whatsapp' using errcode='22023'; end if;
  select business.id,business.name,business.slug,business.logo_url,settings.duration_mode,settings.fixed_duration_minutes
  into selected_business from public.businesses business join public.business_settings settings on settings.business_id=business.id
  where business.slug=lower(trim(p_slug)) and business.active;
  if not found then raise exception 'booking_business_unavailable' using errcode='22023'; end if;
  select exists(select 1 from public.booking_groups where business_id=selected_business.id and position=1 and active) into group_1_active;
  select exists(select 1 from public.booking_groups where business_id=selected_business.id and position=2 and active) into group_2_active;
  if group_1_active then
    select booking_option.id,booking_group.label,booking_option.name into selected_group_1,group_1_label,group_1_name
    from public.booking_options booking_option join public.booking_groups booking_group on booking_group.id=booking_option.group_id
    where booking_option.id=p_group_1_option_id and booking_option.business_id=selected_business.id and booking_option.active and booking_group.position=1 and booking_group.active;
    if not found then raise exception 'booking_invalid_group_1' using errcode='22023'; end if;
  elsif p_group_1_option_id is not null then raise exception 'booking_invalid_group_1' using errcode='22023'; end if;
  if group_2_active then
    select booking_option.id,booking_group.label,booking_option.name,booking_option.duration_minutes
    into selected_group_2,group_2_label,group_2_name,base_duration
    from public.booking_options booking_option join public.booking_groups booking_group on booking_group.id=booking_option.group_id
    where booking_option.id=p_group_2_option_id and booking_option.business_id=selected_business.id and booking_option.active and booking_group.position=2 and booking_group.active;
    if not found then raise exception 'booking_invalid_group_2' using errcode='22023'; end if;
  elsif p_group_2_option_id is not null then raise exception 'booking_invalid_group_2' using errcode='22023'; end if;
  if selected_business.duration_mode='group_2' then
    if selected_group_2 is null or base_duration is null or base_duration<=0 then raise exception 'booking_group_2_duration_required' using errcode='22023'; end if;
    if coalesce(p_blocks,1)<>1 then raise exception 'booking_invalid_blocks' using errcode='22023'; end if;
    total_duration:=base_duration;
  else
    base_duration:=selected_business.fixed_duration_minutes;
    if base_duration is null or base_duration<=0 then raise exception 'booking_invalid_duration' using errcode='22023'; end if;
    if selected_business.duration_mode='fixed' and coalesce(p_blocks,1)<>1 then raise exception 'booking_invalid_blocks' using errcode='22023'; end if;
    if selected_business.duration_mode='fixed_multiple' and (p_blocks is null or p_blocks<1) then raise exception 'booking_invalid_blocks' using errcode='22023'; end if;
    total_duration:=base_duration*coalesce(p_blocks,1);
  end if;
  if p_date is null or p_start_time is null or p_date<local_now::date or (p_date=local_now::date and p_date+p_start_time<=local_now) then
    raise exception 'booking_invalid_date' using errcode='22023';
  end if;
  if not private.public_primary_interval_is_valid(selected_business.id,selected_group_1,p_date,p_start_time,total_duration,base_duration) then
    raise exception 'booking_outside_business_hours' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(selected_business.id::text||':'||p_date::text,0));
  available:=private.get_primary_booking_availability(selected_business.id,p_date,selected_group_1,selected_group_2,null,true,true);
  if not exists(select 1 from jsonb_array_elements(available) slot where slot->>'start_time'=to_char(p_start_time,'HH24:MI') and (slot->>'max_blocks')::integer>=coalesce(p_blocks,1)) then
    raise exception 'booking_conflict' using errcode='23P01';
  end if;
  calculated_end:=(p_date+p_start_time+make_interval(mins=>total_duration))::time;
  begin
    insert into public.appointments(business_id,group_1_option_id,group_2_option_id,customer_name,customer_whatsapp,appointment_date,start_time,end_time,duration_minutes,status,created_by)
    values(selected_business.id,selected_group_1,selected_group_2,trim(p_customer_name),normalized_whatsapp,p_date,p_start_time,calculated_end,total_duration,'scheduled',null);
  exception when exclusion_violation then raise exception 'booking_conflict' using errcode='23P01'; end;
  return jsonb_build_object(
    'business',jsonb_build_object('name',selected_business.name,'slug',selected_business.slug,'logo_url',selected_business.logo_url),
    'group_1',case when selected_group_1 is null then null else jsonb_build_object('label',group_1_label,'name',group_1_name) end,
    'group_2',case when selected_group_2 is null then null else jsonb_build_object('label',group_2_label,'name',group_2_name) end,
    'appointment_date',p_date,'start_time',p_start_time,'end_time',calculated_end,'duration_minutes',total_duration,'customer_name',trim(p_customer_name));
end;
$$;

revoke all on function public.create_public_appointment(text,uuid,uuid,date,time,integer,text,text) from public;
grant execute on function public.create_public_appointment(text,uuid,uuid,date,time,integer,text,text) to anon,authenticated;

-- Blocks remain extraordinary unavailability, but their public-hours check
-- now follows the selected primary resource's effective schedule.
create or replace function private.calendar_interval_is_available(
  p_business_id uuid,p_group_1_option_id uuid,p_date date,p_start_time time,p_end_time time,p_exclude_block_id uuid default null
)
returns boolean language sql stable security definer set search_path=''
as $$
  select p_start_time<private.normalize_end_of_day_time(p_start_time,p_end_time)
    and exists(select 1 from private.get_effective_primary_option_hours(p_business_id,p_group_1_option_id,p_date) hour
      where p_start_time>=hour.start_time and private.normalize_end_of_day_time(p_start_time,p_end_time)<=hour.end_time)
    and not exists(select 1 from public.appointments appointment where appointment.business_id=p_business_id
      and appointment.appointment_date=p_date and appointment.status<>'cancelled'
      and coalesce(appointment.group_1_option_id,appointment.business_id)=coalesce(p_group_1_option_id,p_business_id)
      and appointment.start_time<private.normalize_end_of_day_time(p_start_time,p_end_time) and appointment.end_time>p_start_time)
    and not exists(select 1 from public.calendar_blocks block where block.business_id=p_business_id and block.block_date=p_date
      and block.cancelled_at is null and (p_exclude_block_id is null or block.id<>p_exclude_block_id)
      and block.resource_id=coalesce(p_group_1_option_id,p_business_id)
      and block.start_time<private.normalize_end_of_day_time(p_start_time,p_end_time) and block.end_time>p_start_time);
$$;

-- Curated date availability only: raw custom windows remain private. Legacy
-- business-schedule option objects keep their exact shape.
create or replace function public.get_public_booking_page(p_slug text)
returns jsonb language sql stable security definer set search_path=''
as $$
  select jsonb_build_object(
    'business',jsonb_build_object('id',business.id,'name',business.name,'slug',business.slug,'whatsapp',business.whatsapp,'logo_url',business.logo_url,
      'address',business.address,'google_maps_url',business.google_maps_url,'instagram_url',business.instagram_url,'facebook_url',business.facebook_url),
    'groups',coalesce((select jsonb_agg(
      jsonb_build_object('position',booking_group.position,'label',booking_group.label,'required',booking_group.required,
        'options',coalesce((select jsonb_agg(
          jsonb_build_object('id',booking_option.id,'name',booking_option.name,'duration_minutes',booking_option.duration_minutes)
          || case when booking_group.position=1 and booking_option.schedule_mode='custom' then jsonb_build_object(
            'available_weekdays',coalesce((select jsonb_agg(distinct option_hour.weekday order by option_hour.weekday)
              from public.booking_option_hours option_hour where option_hour.option_id=booking_option.id and option_hour.business_id=business.id and option_hour.active),'[]'::jsonb)
          ) else '{}'::jsonb end order by booking_option.sort_order,booking_option.name)
          from public.booking_options booking_option where booking_option.business_id=business.id and booking_option.group_id=booking_group.id and booking_option.active),'[]'::jsonb))
      || case when booking_group.position=3 then jsonb_build_object('intent_name',booking_group.intent_name,'occupancy_mode',booking_group.occupancy_mode) else '{}'::jsonb end
      order by booking_group.sort_order,booking_group.position)
      from public.booking_groups booking_group where booking_group.business_id=business.id and booking_group.active),'[]'::jsonb),
    'hours',coalesce((select jsonb_agg(jsonb_build_object('weekday',business_hour.weekday,'start_time',business_hour.start_time,'end_time',business_hour.end_time) order by business_hour.weekday)
      from public.business_hours business_hour where business_hour.business_id=business.id and business_hour.active),'[]'::jsonb),
    'settings',jsonb_build_object('duration_mode',settings.duration_mode,'fixed_duration_minutes',settings.fixed_duration_minutes,
      'allow_multiple_blocks',settings.allow_multiple_blocks,'palette',settings.palette,'theme_preference',settings.theme_preference))
  from public.businesses business join public.business_settings settings on settings.business_id=business.id
  where business.slug=lower(trim(p_slug)) and business.active limit 1;
$$;

revoke all on function public.get_public_booking_page(text) from public;
grant execute on function public.get_public_booking_page(text) to anon,authenticated;

comment on column public.booking_options.schedule_mode is 'business inherits business_hours; custom exclusively uses booking_option_hours.';
comment on table public.booking_option_hours is 'Normalized public availability windows for primary options in custom schedule mode.';
comment on function public.set_admin_booking_option_schedule(uuid,public.booking_option_schedule_mode,jsonb) is 'Atomically changes one authorized primary option schedule and replaces custom windows; business mode preserves stored custom rows.';
comment on function private.get_effective_primary_option_hours(uuid,uuid,date) is 'Single authority resolving business_hours or booking_option_hours; custom never falls back to business hours.';
