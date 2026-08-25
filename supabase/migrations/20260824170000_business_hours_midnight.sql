-- Treat 00:00 exclusively as a user-facing end-of-day value. PostgreSQL keeps
-- time '24:00' distinct from time '00:00', so persisted end times use 24:00
-- while start times retain the ordinary beginning-of-day meaning of 00:00.

create or replace function private.normalize_end_of_day_time(
  p_start_time time,
  p_end_time time
)
returns time
language sql
immutable
set search_path = ''
as $$
  select case
    when p_start_time <> time '00:00' and p_end_time = time '00:00'
      then time '24:00'
    else p_end_time
  end;
$$;

create or replace function private.normalize_midnight_end_time()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.end_time := private.normalize_end_of_day_time(new.start_time, new.end_time);
  return new;
end;
$$;

create trigger business_hours_00_normalize_midnight_end
before insert or update of start_time, end_time on public.business_hours
for each row execute function private.normalize_midnight_end_time();

create trigger appointments_00_normalize_midnight_end
before insert or update of start_time, end_time on public.appointments
for each row execute function private.normalize_midnight_end_time();

create trigger calendar_blocks_00_normalize_midnight_end
before insert or update of start_time, end_time on public.calendar_blocks
for each row execute function private.normalize_midnight_end_time();

create trigger calendar_block_series_00_normalize_midnight_end
before insert or update of start_time, end_time on public.calendar_block_series
for each row execute function private.normalize_midnight_end_time();

revoke all on function private.normalize_end_of_day_time(time, time) from public, anon, authenticated;
revoke all on function private.normalize_midnight_end_time() from public, anon, authenticated;

create or replace function private.validate_business_hours_payload(p_hours jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(jsonb_typeof(p_hours), '') <> 'array'
    or jsonb_array_length(p_hours) <> 7
    or (
      select count(distinct (day ->> 'weekday')::integer)
      from jsonb_array_elements(p_hours) as selected(day)
    ) <> 7
    or exists (
      select 1
      from jsonb_array_elements(p_hours) as selected(day)
      where (day ->> 'weekday')::integer not between 0 and 6
        or coalesce(jsonb_typeof(day -> 'windows'), '') <> 'array'
    ) then
    raise exception 'business_hours_invalid_days' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_hours) as selected(day)
    cross join lateral jsonb_array_elements(day -> 'windows') as selected_window(payload)
    where nullif(payload ->> 'start_time', '') is null
      or nullif(payload ->> 'end_time', '') is null
      or (payload ->> 'start_time')::time >= private.normalize_end_of_day_time(
        (payload ->> 'start_time')::time,
        (payload ->> 'end_time')::time
      )
  ) then
    raise exception 'business_hours_invalid_window' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_hours) as selected(day)
    cross join lateral jsonb_array_elements(day -> 'windows') with ordinality
      as first_window(payload, position)
    join lateral jsonb_array_elements(day -> 'windows') with ordinality
      as second_window(payload, position)
      on first_window.position < second_window.position
    where (first_window.payload ->> 'start_time')::time
        < private.normalize_end_of_day_time(
          (second_window.payload ->> 'start_time')::time,
          (second_window.payload ->> 'end_time')::time
        )
      and private.normalize_end_of_day_time(
        (first_window.payload ->> 'start_time')::time,
        (first_window.payload ->> 'end_time')::time
      ) > (second_window.payload ->> 'start_time')::time
  ) then
    raise exception 'business_hours_overlap' using errcode = '23P01';
  end if;
end;
$$;

revoke all on function private.validate_business_hours_payload(jsonb) from public, anon, authenticated;

create or replace function private.get_booking_availability_without_calendar_blocks(
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
  selected_business record;
  selected_group_1 uuid;
  selected_group_2 uuid;
  group_1_active boolean;
  group_2_active boolean;
  base_duration integer;
  excluded_terminal_start time;
  local_now timestamp := pg_catalog.now() at time zone 'America/Sao_Paulo';
  result jsonb;
begin
  select business.id, settings.duration_mode, settings.fixed_duration_minutes,
    settings.allow_multiple_blocks
  into selected_business
  from public.businesses business
  join public.business_settings settings on settings.business_id = business.id
  where business.slug = lower(trim(p_slug)) and business.active;

  if not found or p_date is null then return '[]'::jsonb; end if;

  if p_exclude_appointment_id is not null then
    select appointment.start_time into excluded_terminal_start
    from public.appointments appointment
    where appointment.id = p_exclude_appointment_id
      and appointment.business_id = selected_business.id
      and appointment.appointment_date = p_date
      and appointment.status in ('completed', 'cancelled', 'no_show');
  end if;
  if p_date < local_now::date and excluded_terminal_start is null then return '[]'::jsonb; end if;

  select exists (
    select 1 from public.booking_groups
    where business_id = selected_business.id and position = 1 and active
  ) into group_1_active;
  select exists (
    select 1 from public.booking_groups
    where business_id = selected_business.id and position = 2 and active
  ) into group_2_active;

  if group_1_active then
    select option.id into selected_group_1
    from public.booking_options option
    join public.booking_groups booking_group on booking_group.id = option.group_id
    where option.id = p_group_1_option_id
      and option.business_id = selected_business.id
      and option.active and booking_group.position = 1 and booking_group.active;
    if not found then raise exception 'booking_invalid_group_1' using errcode = '22023'; end if;
  elsif p_group_1_option_id is not null then
    raise exception 'booking_invalid_group_1' using errcode = '22023';
  end if;

  if group_2_active then
    select option.id into selected_group_2
    from public.booking_options option
    join public.booking_groups booking_group on booking_group.id = option.group_id
    where option.id = p_group_2_option_id
      and option.business_id = selected_business.id
      and option.active and booking_group.position = 2 and booking_group.active;
    if not found then raise exception 'booking_invalid_group_2' using errcode = '22023'; end if;
  elsif p_group_2_option_id is not null then
    raise exception 'booking_invalid_group_2' using errcode = '22023';
  end if;

  if selected_business.duration_mode = 'group_2' then
    if not group_2_active or selected_group_2 is null then
      raise exception 'booking_group_2_duration_required' using errcode = '22023';
    end if;
    select duration_minutes into base_duration
    from public.booking_options where id = selected_group_2;
  else
    base_duration := selected_business.fixed_duration_minutes;
  end if;
  if base_duration is null or base_duration <= 0 then
    raise exception 'booking_invalid_duration' using errcode = '22023';
  end if;

  with opening_windows as (
    select business_hour.start_time, business_hour.end_time
    from public.business_hours business_hour
    where business_hour.business_id = selected_business.id
      and business_hour.weekday = extract(dow from p_date)::integer
      and business_hour.active
  ), generated_candidates as (
    select generated.candidate, opening_window.end_time as window_end
    from opening_windows opening_window
    cross join lateral generate_series(
      p_date + opening_window.start_time,
      p_date + opening_window.end_time - pg_catalog.make_interval(mins => base_duration),
      pg_catalog.make_interval(mins => base_duration)
    ) generated(candidate)
    union
    select
      p_date + opening_window.end_time - pg_catalog.make_interval(mins => base_duration),
      opening_window.end_time
    from opening_windows opening_window
    where opening_window.end_time = time '24:00'
  ), candidates as (
    select candidate, window_end
    from generated_candidates
    where p_date > local_now::date
      or candidate > local_now
      or (
        excluded_terminal_start is not null
        and candidate::time = excluded_terminal_start
      )
  ), available as (
    select candidate,
      case when selected_business.duration_mode = 'fixed_multiple' then (
        select max(block_count)
        from generate_series(
          1,
          floor(extract(epoch from ((p_date + window_end) - candidate)) / 60 / base_duration)::integer
        ) blocks(block_count)
        where not exists (
          select 1 from public.appointments appointment
          where appointment.business_id = selected_business.id
            and appointment.appointment_date = p_date
            and appointment.status <> 'cancelled'
            and (p_exclude_appointment_id is null or appointment.id <> p_exclude_appointment_id)
            and coalesce(appointment.group_1_option_id, appointment.business_id)
              = coalesce(selected_group_1, selected_business.id)
            and appointment.start_time < private.normalize_end_of_day_time(
              candidate::time,
              (candidate + pg_catalog.make_interval(mins => base_duration * block_count))::time
            )
            and appointment.end_time > candidate::time
        )
      ) else case when not exists (
        select 1 from public.appointments appointment
        where appointment.business_id = selected_business.id
          and appointment.appointment_date = p_date
          and appointment.status <> 'cancelled'
          and (p_exclude_appointment_id is null or appointment.id <> p_exclude_appointment_id)
          and coalesce(appointment.group_1_option_id, appointment.business_id)
            = coalesce(selected_group_1, selected_business.id)
          and appointment.start_time < private.normalize_end_of_day_time(
            candidate::time,
            (candidate + pg_catalog.make_interval(mins => base_duration))::time
          )
          and appointment.end_time > candidate::time
      ) then 1 else 0 end end as max_blocks
    from candidates
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'start_time', to_char(candidate, 'HH24:MI'),
    'duration_minutes', base_duration,
    'max_blocks', max_blocks
  ) order by candidate), '[]'::jsonb) into result
  from available where max_blocks > 0;
  return result;
end;
$$;

revoke all on function private.get_booking_availability_without_calendar_blocks(text, date, uuid, uuid, uuid) from public;

-- Recalculate the calendar-block filter with normalized end times. The
-- underlying public engine already generates through 24:00 once the opening
-- window is normalized by the table trigger.
create or replace function private.get_booking_availability(
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
  candidate_end time;
  result jsonb := '[]'::jsonb;
begin
  select id into selected_business_id
  from public.businesses
  where slug = lower(trim(p_slug)) and active;
  if selected_business_id is null then return '[]'::jsonb; end if;

  raw_slots := private.get_booking_availability_without_calendar_blocks(
    p_slug,
    p_date,
    p_group_1_option_id,
    p_group_2_option_id,
    p_exclude_appointment_id
  );

  for slot in select value from jsonb_array_elements(raw_slots)
  loop
    start_at := (slot ->> 'start_time')::time;
    duration := (slot ->> 'duration_minutes')::integer;
    max_blocks := (slot ->> 'max_blocks')::integer;
    allowed_blocks := 0;

    for candidate_blocks in reverse max_blocks..1 loop
      candidate_end := private.normalize_end_of_day_time(
        start_at,
        (p_date + start_at + make_interval(mins => duration * candidate_blocks))::time
      );
      if not exists (
        select 1
        from public.appointments appointment
        where appointment.business_id = selected_business_id
          and appointment.appointment_date = p_date
          and appointment.status <> 'cancelled'::public.appointment_status
          and (p_exclude_appointment_id is null or appointment.id <> p_exclude_appointment_id)
          and coalesce(appointment.group_1_option_id, appointment.business_id)
            = coalesce(p_group_1_option_id, selected_business_id)
          and appointment.start_time < candidate_end
          and appointment.end_time > start_at
      ) and not exists (
        select 1
        from public.calendar_blocks block
        where block.business_id = selected_business_id
          and block.block_date = p_date
          and block.cancelled_at is null
          and block.resource_id = coalesce(p_group_1_option_id, selected_business_id)
          and block.start_time < candidate_end
          and block.end_time > start_at
      ) then
        allowed_blocks := candidate_blocks;
        exit;
      end if;
    end loop;

    if allowed_blocks > 0 then
      result := result || jsonb_build_array(
        slot || jsonb_build_object('max_blocks', allowed_blocks)
      );
    end if;
  end loop;
  return result;
end;
$$;

revoke all on function private.get_booking_availability(text, date, uuid, uuid, uuid) from public;

create or replace function private.get_admin_booking_availability(
  p_business_id uuid,
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
  select business.id, settings.duration_mode, settings.fixed_duration_minutes,
    settings.allow_multiple_blocks
  into selected_business
  from public.businesses business
  join public.business_settings settings on settings.business_id = business.id
  where business.id = p_business_id and business.active;
  if not found or p_date is null then return '[]'::jsonb; end if;

  if p_exclude_appointment_id is not null then
    select appointment.start_time into excluded_start
    from public.appointments appointment
    where appointment.id = p_exclude_appointment_id
      and appointment.business_id = selected_business.id
      and appointment.appointment_date = p_date;
  end if;
  if p_date < local_now::date and excluded_start is null then return '[]'::jsonb; end if;

  select exists (
    select 1 from public.booking_groups
    where business_id = selected_business.id and position = 1 and active
  ) into group_1_active;
  select exists (
    select 1 from public.booking_groups
    where business_id = selected_business.id and position = 2 and active
  ) into group_2_active;

  if group_1_active then
    select option.id into selected_group_1
    from public.booking_options option
    join public.booking_groups booking_group on booking_group.id = option.group_id
    where option.id = p_group_1_option_id
      and option.business_id = selected_business.id
      and option.active and booking_group.active and booking_group.position = 1;
    if not found then raise exception 'booking_invalid_group_1' using errcode = '22023'; end if;
  elsif p_group_1_option_id is not null then
    raise exception 'booking_invalid_group_1' using errcode = '22023';
  end if;

  if group_2_active then
    select option.id into selected_group_2
    from public.booking_options option
    join public.booking_groups booking_group on booking_group.id = option.group_id
    where option.id = p_group_2_option_id
      and option.business_id = selected_business.id
      and option.active and booking_group.active and booking_group.position = 2;
    if not found then raise exception 'booking_invalid_group_2' using errcode = '22023'; end if;
  elsif p_group_2_option_id is not null then
    raise exception 'booking_invalid_group_2' using errcode = '22023';
  end if;

  if selected_business.duration_mode = 'group_2' then
    if selected_group_2 is null then
      raise exception 'booking_group_2_duration_required' using errcode = '22023';
    end if;
    select duration_minutes into base_duration
    from public.booking_options where id = selected_group_2;
  else
    base_duration := selected_business.fixed_duration_minutes;
  end if;
  if base_duration is null or base_duration <= 0 then
    raise exception 'booking_invalid_duration' using errcode = '22023';
  end if;

  with anchors as (
    select p_date::timestamp as anchor
    union
    select p_date + hour.start_time
    from public.business_hours hour
    where hour.business_id = selected_business.id
      and hour.weekday = extract(dow from p_date)::integer
      and hour.active
  ), candidates as (
    select distinct generated.candidate
    from anchors
    cross join lateral pg_catalog.generate_series(
      anchor,
      p_date + interval '1 day' - pg_catalog.make_interval(mins => base_duration),
      pg_catalog.make_interval(mins => base_duration)
    ) generated(candidate)
    where p_date > local_now::date or generated.candidate > local_now
      or (excluded_start is not null and generated.candidate::time = excluded_start)
  ), available as (
    select candidate,
      case when selected_business.duration_mode = 'fixed_multiple' then (
        select max(block_count)
        from pg_catalog.generate_series(
          1,
          floor(extract(epoch from ((p_date + interval '1 day') - candidate)) / 60 / base_duration)::integer
        ) blocks(block_count)
        where not exists (
          select 1 from public.appointments appointment
          where appointment.business_id = selected_business.id
            and appointment.appointment_date = p_date
            and appointment.status <> 'cancelled'::public.appointment_status
            and (p_exclude_appointment_id is null or appointment.id <> p_exclude_appointment_id)
            and coalesce(appointment.group_1_option_id, appointment.business_id)
              = coalesce(selected_group_1, selected_business.id)
            and appointment.start_time < private.normalize_end_of_day_time(
              candidate::time,
              (candidate + pg_catalog.make_interval(mins => base_duration * block_count))::time
            )
            and appointment.end_time > candidate::time
        ) and not exists (
          select 1 from public.calendar_blocks block
          where block.business_id = selected_business.id
            and block.block_date = p_date
            and block.cancelled_at is null
            and block.resource_id = coalesce(selected_group_1, selected_business.id)
            and block.start_time < private.normalize_end_of_day_time(
              candidate::time,
              (candidate + pg_catalog.make_interval(mins => base_duration * block_count))::time
            )
            and block.end_time > candidate::time
        )
      ) else case when not exists (
        select 1 from public.appointments appointment
        where appointment.business_id = selected_business.id
          and appointment.appointment_date = p_date
          and appointment.status <> 'cancelled'::public.appointment_status
          and (p_exclude_appointment_id is null or appointment.id <> p_exclude_appointment_id)
          and coalesce(appointment.group_1_option_id, appointment.business_id)
            = coalesce(selected_group_1, selected_business.id)
          and appointment.start_time < private.normalize_end_of_day_time(
            candidate::time,
            (candidate + pg_catalog.make_interval(mins => base_duration))::time
          )
          and appointment.end_time > candidate::time
      ) and not exists (
        select 1 from public.calendar_blocks block
        where block.business_id = selected_business.id
          and block.block_date = p_date
          and block.cancelled_at is null
          and block.resource_id = coalesce(selected_group_1, selected_business.id)
          and block.start_time < private.normalize_end_of_day_time(
            candidate::time,
            (candidate + pg_catalog.make_interval(mins => base_duration))::time
          )
          and block.end_time > candidate::time
      ) then 1 else 0 end end as max_blocks
    from candidates
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'start_time', to_char(candidate, 'HH24:MI'),
    'duration_minutes', base_duration,
    'max_blocks', max_blocks
  ) order by candidate), '[]'::jsonb) into result
  from available where max_blocks > 0;
  return result;
end;
$$;

revoke all on function private.get_admin_booking_availability(uuid, date, uuid, uuid, uuid) from public;

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
  select p_start_time < private.normalize_end_of_day_time(p_start_time, p_end_time)
    and exists (
      select 1 from public.business_hours hour
      where hour.business_id = p_business_id
        and hour.weekday = extract(dow from p_date)::integer
        and hour.active
        and p_start_time >= hour.start_time
        and private.normalize_end_of_day_time(p_start_time, p_end_time) <= hour.end_time
    )
    and not exists (
      select 1 from public.appointments appointment
      where appointment.business_id = p_business_id
        and appointment.appointment_date = p_date
        and appointment.status <> 'cancelled'::public.appointment_status
        and coalesce(appointment.group_1_option_id, appointment.business_id)
          = coalesce(p_group_1_option_id, p_business_id)
        and appointment.start_time < private.normalize_end_of_day_time(p_start_time, p_end_time)
        and appointment.end_time > p_start_time
    )
    and not exists (
      select 1 from public.calendar_blocks block
      where block.business_id = p_business_id
        and block.block_date = p_date
        and block.cancelled_at is null
        and (p_exclude_block_id is null or block.id <> p_exclude_block_id)
        and block.resource_id = coalesce(p_group_1_option_id, p_business_id)
        and block.start_time < private.normalize_end_of_day_time(p_start_time, p_end_time)
        and block.end_time > p_start_time
    );
$$;

revoke all on function private.calendar_interval_is_available(uuid, uuid, date, time, time, uuid) from public;

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
  normalized_end_time time := private.normalize_end_of_day_time(p_start_time, p_end_time);
begin
  if current_user_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_date is null or p_start_time is null or p_end_time is null
    or p_start_time >= normalized_end_time or p_date < current_date then
    raise exception 'calendar_block_invalid_interval' using errcode = '22023';
  end if;
  if p_recurring and p_repeat_count is not null and p_repeat_count < 2 then
    raise exception 'calendar_block_invalid_repeat_count' using errcode = '22023';
  end if;
  select membership.business_id into selected_business_id
  from public.business_members membership
  join public.businesses business on business.id = membership.business_id
  where membership.user_id = current_user_id
    and membership.role in ('owner','admin') and business.active
  order by membership.created_at, membership.id limit 1;
  if selected_business_id is null then raise exception 'calendar_block_forbidden' using errcode = '42501'; end if;
  resources := case when coalesce(array_length(p_group_1_option_ids, 1), 0) = 0
    then array[null::uuid]
    else array(select distinct value from unnest(p_group_1_option_ids) value) end;

  foreach resource_id in array resources loop
    perform private.validate_calendar_block_resource(selected_business_id, resource_id);
    if not p_recurring then
      if not private.calendar_interval_is_available(
        selected_business_id, resource_id, p_date, p_start_time, normalized_end_time, null
      ) then
        raise exception 'calendar_block_conflicts:[{"date":"%","start_time":"%"}]',
          p_date, to_char(p_start_time,'HH24:MI') using errcode = '23P01';
      end if;
      insert into public.calendar_blocks (
        business_id, group_1_option_id, block_date, start_time, end_time, reason, created_by
      ) values (
        selected_business_id, resource_id, p_date, p_start_time, normalized_end_time,
        nullif(trim(p_reason),''), current_user_id
      ) returning id into new_block_id;
      created_ids := created_ids || jsonb_build_array(new_block_id);
    else
      insert into public.calendar_block_series (
        business_id, group_1_option_id, weekday, start_time, end_time,
        starts_on, repeat_count, reason, created_by
      ) values (
        selected_business_id, resource_id, extract(dow from p_date)::smallint,
        p_start_time, normalized_end_time, p_date, p_repeat_count,
        nullif(trim(p_reason),''), current_user_id
      ) returning id into new_series_id;
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
  p_block_id uuid,
  p_date date,
  p_start_time time,
  p_end_time time,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected public.calendar_blocks%rowtype;
  normalized_end_time time := private.normalize_end_of_day_time(p_start_time, p_end_time);
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  select block.* into selected
  from public.calendar_blocks block
  where block.id = p_block_id and block.cancelled_at is null
    and private.has_business_role(
      block.business_id,
      array['owner','admin']::public.business_role[]
    )
  for update;
  if not found then raise exception 'calendar_block_not_found' using errcode = '42501'; end if;
  if not private.calendar_interval_is_available(
    selected.business_id,
    selected.group_1_option_id,
    p_date,
    p_start_time,
    normalized_end_time,
    selected.id
  ) then
    raise exception 'calendar_block_conflict' using errcode = '23P01';
  end if;
  update public.calendar_blocks
  set block_date = p_date,
    start_time = p_start_time,
    end_time = normalized_end_time,
    reason = nullif(trim(p_reason),'')
  where id = selected.id;
  return true;
exception when exclusion_violation then
  raise exception 'calendar_block_conflict' using errcode = '23P01';
end;
$$;

revoke all on function public.create_calendar_blocks(uuid[], date, time, time, text, boolean, integer) from public;
revoke all on function public.update_calendar_block(uuid, date, time, time, text) from public;
grant execute on function public.create_calendar_blocks(uuid[], date, time, time, text, boolean, integer) to authenticated;
grant execute on function public.update_calendar_block(uuid, date, time, time, text) to authenticated;

comment on function private.normalize_end_of_day_time(time, time) is
  'Normalizes a user-facing 00:00 end to PostgreSQL 24:00 only when the start is later than midnight; it never permits an arbitrary overnight interval.';
comment on function private.normalize_midnight_end_time() is
  'Canonical table-boundary normalization for business hours, appointments and calendar blocks ending exactly at midnight.';
