-- Multiple normalized opening windows per weekday.

alter table public.business_hours
drop constraint business_hours_business_weekday_unique;

alter table public.business_hours
add constraint business_hours_window_unique
  unique (business_id, weekday, start_time, end_time),
add constraint business_hours_no_overlapping_windows
  exclude using gist (
    business_id with =,
    weekday with =,
    (int4range(
      (extract(epoch from start_time) / 60)::integer,
      (extract(epoch from end_time) / 60)::integer,
      '[)'
    )) with &&
  );

create index business_hours_business_weekday_start_idx
  on public.business_hours (business_id, weekday, start_time);

comment on table public.business_hours is
  'Normalized opening windows. A business may have multiple non-overlapping rows for each weekday.';
comment on constraint business_hours_no_overlapping_windows on public.business_hours is
  'Rejects overlapping windows for the same business and weekday; adjacent [start,end) windows are allowed.';

create or replace function private.validate_business_hours_payload(p_hours jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(jsonb_typeof(p_hours), '') <> 'array'
    or jsonb_array_length(p_hours) <> 7
    or (select count(distinct (day ->> 'weekday')::integer) from jsonb_array_elements(p_hours) as selected(day)) <> 7
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
      or (payload ->> 'start_time')::time >= (payload ->> 'end_time')::time
  ) then
    raise exception 'business_hours_invalid_window' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_hours) as selected(day)
    cross join lateral jsonb_array_elements(day -> 'windows') with ordinality as first_window(payload, position)
    join lateral jsonb_array_elements(day -> 'windows') with ordinality as second_window(payload, position)
      on first_window.position < second_window.position
    where (first_window.payload ->> 'start_time')::time < (second_window.payload ->> 'end_time')::time
      and (first_window.payload ->> 'end_time')::time > (second_window.payload ->> 'start_time')::time
  ) then
    raise exception 'business_hours_overlap' using errcode = '23P01';
  end if;
end;
$$;

create or replace function private.insert_business_hours_payload(
  p_business_id uuid,
  p_hours jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.validate_business_hours_payload(p_hours);

  delete from public.business_hours
  where business_id = p_business_id;

  insert into public.business_hours (
    business_id,
    weekday,
    active,
    start_time,
    end_time
  )
  select
    p_business_id,
    (day ->> 'weekday')::smallint,
    coalesce((day ->> 'active')::boolean, false),
    (selected_window ->> 'start_time')::time,
    (selected_window ->> 'end_time')::time
  from jsonb_array_elements(p_hours) as selected_day(day)
  cross join lateral jsonb_array_elements(day -> 'windows') as windows(selected_window);
end;
$$;

revoke all on function private.validate_business_hours_payload(jsonb) from public, anon, authenticated;
revoke all on function private.insert_business_hours_payload(uuid, jsonb) from public, anon, authenticated;

alter function public.complete_business_onboarding(jsonb)
rename to complete_business_onboarding_single_window;

revoke all on function public.complete_business_onboarding_single_window(jsonb) from public, anon, authenticated;

create or replace function public.complete_business_onboarding(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  legacy_payload jsonb;
  new_business_id uuid;
begin
  perform private.validate_business_hours_payload(p_payload -> 'hours');

  select jsonb_set(
    p_payload,
    '{hours}',
    jsonb_agg(
      jsonb_build_object(
        'weekday', (day ->> 'weekday')::integer,
        'active', coalesce((day ->> 'active')::boolean, false)
          and jsonb_array_length(day -> 'windows') > 0,
        'start_time', coalesce(day #>> '{windows,0,start_time}', '08:00'),
        'end_time', coalesce(day #>> '{windows,0,end_time}', '18:00')
      )
      order by (day ->> 'weekday')::integer
    )
  )
  into legacy_payload
  from jsonb_array_elements(p_payload -> 'hours') as selected(day);

  new_business_id := public.complete_business_onboarding_single_window(legacy_payload);
  perform private.insert_business_hours_payload(new_business_id, p_payload -> 'hours');
  return new_business_id;
end;
$$;

revoke all on function public.complete_business_onboarding(jsonb) from public;
grant execute on function public.complete_business_onboarding(jsonb) to authenticated;

create or replace function public.replace_business_hours(p_hours jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  selected_business_id uuid;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select membership.business_id
  into selected_business_id
  from public.business_members as membership
  where membership.user_id = current_user_id
    and membership.role in ('owner', 'admin')
  order by membership.created_at, membership.id
  limit 1;

  if not found then
    raise exception 'business_hours_forbidden' using errcode = '42501';
  end if;

  perform private.insert_business_hours_payload(selected_business_id, p_hours);
  return true;
end;
$$;

revoke all on function public.replace_business_hours(jsonb) from public;
grant execute on function public.replace_business_hours(jsonb) to authenticated;

comment on function private.validate_business_hours_payload(jsonb) is
  'Validates the seven-day nested opening-window payload, including [start,end) overlap rules.';
comment on function private.insert_business_hours_payload(uuid, jsonb) is
  'Atomically replaces normalized opening windows for a previously authorized business.';
comment on function public.replace_business_hours(jsonb) is
  'Allows an owner/admin to atomically replace every opening window of their current business.';

create or replace function public.get_booking_availability(
  p_slug text,
  p_date date,
  p_group_1_option_id uuid,
  p_group_2_option_id uuid
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
  local_now timestamp := pg_catalog.now() at time zone 'America/Sao_Paulo';
  result jsonb;
begin
  select
    business.id,
    settings.duration_mode,
    settings.fixed_duration_minutes,
    settings.allow_multiple_blocks
  into selected_business
  from public.businesses as business
  join public.business_settings as settings on settings.business_id = business.id
  where business.slug = lower(trim(p_slug))
    and business.active;

  if not found or p_date is null or p_date < local_now::date then
    return '[]'::jsonb;
  end if;

  select exists (
    select 1 from public.booking_groups
    where business_id = selected_business.id and position = 1 and active
  ) into group_1_active;
  select exists (
    select 1 from public.booking_groups
    where business_id = selected_business.id and position = 2 and active
  ) into group_2_active;

  if group_1_active then
    select booking_option.id into selected_group_1
    from public.booking_options as booking_option
    join public.booking_groups as booking_group on booking_group.id = booking_option.group_id
    where booking_option.id = p_group_1_option_id
      and booking_option.business_id = selected_business.id
      and booking_option.active
      and booking_group.position = 1
      and booking_group.active;
    if not found then
      raise exception 'booking_invalid_group_1' using errcode = '22023';
    end if;
  elsif p_group_1_option_id is not null then
    raise exception 'booking_invalid_group_1' using errcode = '22023';
  end if;

  if group_2_active then
    select booking_option.id into selected_group_2
    from public.booking_options as booking_option
    join public.booking_groups as booking_group on booking_group.id = booking_option.group_id
    where booking_option.id = p_group_2_option_id
      and booking_option.business_id = selected_business.id
      and booking_option.active
      and booking_group.position = 2
      and booking_group.active;
    if not found then
      raise exception 'booking_invalid_group_2' using errcode = '22023';
    end if;
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
    from public.business_hours as business_hour
    where business_hour.business_id = selected_business.id
      and business_hour.weekday = extract(dow from p_date)::integer
      and business_hour.active
  ), candidates as (
    select generated.candidate, opening_window.end_time as window_end
    from opening_windows as opening_window
    cross join lateral generate_series(
      p_date + opening_window.start_time,
      p_date + opening_window.end_time - make_interval(mins => base_duration),
      make_interval(mins => base_duration)
    ) as generated(candidate)
    where p_date > local_now::date or generated.candidate > local_now
  ), available as (
    select
      candidate,
      case
        when selected_business.duration_mode = 'fixed_multiple' then (
          select max(block_count)
          from generate_series(
            1,
            floor(extract(epoch from ((p_date + window_end) - candidate)) / 60 / base_duration)::integer
          ) as blocks(block_count)
          where not exists (
            select 1
            from public.appointments as appointment
            where appointment.business_id = selected_business.id
              and appointment.appointment_date = p_date
              and appointment.status <> 'cancelled'
              and coalesce(appointment.group_1_option_id, appointment.business_id)
                = coalesce(selected_group_1, selected_business.id)
              and appointment.start_time < (candidate + make_interval(mins => base_duration * block_count))::time
              and appointment.end_time > candidate::time
          )
        )
        else case when not exists (
          select 1
          from public.appointments as appointment
          where appointment.business_id = selected_business.id
            and appointment.appointment_date = p_date
            and appointment.status <> 'cancelled'
            and coalesce(appointment.group_1_option_id, appointment.business_id)
              = coalesce(selected_group_1, selected_business.id)
            and appointment.start_time < (candidate + make_interval(mins => base_duration))::time
            and appointment.end_time > candidate::time
        ) then 1 else 0 end
      end as max_blocks
    from candidates
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'start_time', to_char(candidate, 'HH24:MI'),
      'duration_minutes', base_duration,
      'max_blocks', max_blocks
    ) order by candidate
  ), '[]'::jsonb)
  into result
  from available
  where max_blocks > 0;

  return result;
end;
$$;

create or replace function public.create_public_appointment(
  p_slug text,
  p_group_1_option_id uuid,
  p_group_2_option_id uuid,
  p_date date,
  p_start_time time,
  p_blocks integer,
  p_customer_name text,
  p_customer_whatsapp text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_business record;
  selected_group_1 uuid;
  selected_group_2 uuid;
  group_1_label text;
  group_1_name text;
  group_2_label text;
  group_2_name text;
  group_1_active boolean;
  group_2_active boolean;
  base_duration integer;
  total_duration integer;
  calculated_end time;
  normalized_whatsapp text := regexp_replace(coalesce(p_customer_whatsapp, ''), '\D', '', 'g');
  local_now timestamp := pg_catalog.now() at time zone 'America/Sao_Paulo';
begin
  if char_length(trim(coalesce(p_customer_name, ''))) not between 2 and 120 then
    raise exception 'booking_invalid_customer_name' using errcode = '22023';
  end if;
  if char_length(normalized_whatsapp) not between 10 and 15 then
    raise exception 'booking_invalid_whatsapp' using errcode = '22023';
  end if;

  select
    business.id,
    business.name,
    business.slug,
    business.logo_url,
    settings.duration_mode,
    settings.fixed_duration_minutes,
    settings.allow_multiple_blocks
  into selected_business
  from public.businesses as business
  join public.business_settings as settings on settings.business_id = business.id
  where business.slug = lower(trim(p_slug))
    and business.active;
  if not found then
    raise exception 'booking_business_unavailable' using errcode = '22023';
  end if;

  select exists (
    select 1 from public.booking_groups
    where business_id = selected_business.id and position = 1 and active
  ) into group_1_active;
  select exists (
    select 1 from public.booking_groups
    where business_id = selected_business.id and position = 2 and active
  ) into group_2_active;

  if group_1_active then
    select booking_option.id, booking_group.label, booking_option.name
    into selected_group_1, group_1_label, group_1_name
    from public.booking_options as booking_option
    join public.booking_groups as booking_group on booking_group.id = booking_option.group_id
    where booking_option.id = p_group_1_option_id
      and booking_option.business_id = selected_business.id
      and booking_option.active
      and booking_group.position = 1
      and booking_group.active;
    if not found then
      raise exception 'booking_invalid_group_1' using errcode = '22023';
    end if;
  elsif p_group_1_option_id is not null then
    raise exception 'booking_invalid_group_1' using errcode = '22023';
  end if;

  if group_2_active then
    select booking_option.id, booking_group.label, booking_option.name, booking_option.duration_minutes
    into selected_group_2, group_2_label, group_2_name, base_duration
    from public.booking_options as booking_option
    join public.booking_groups as booking_group on booking_group.id = booking_option.group_id
    where booking_option.id = p_group_2_option_id
      and booking_option.business_id = selected_business.id
      and booking_option.active
      and booking_group.position = 2
      and booking_group.active;
    if not found then
      raise exception 'booking_invalid_group_2' using errcode = '22023';
    end if;
  elsif p_group_2_option_id is not null then
    raise exception 'booking_invalid_group_2' using errcode = '22023';
  end if;

  if selected_business.duration_mode = 'group_2' then
    if not group_2_active or selected_group_2 is null or base_duration is null or base_duration <= 0 then
      raise exception 'booking_group_2_duration_required' using errcode = '22023';
    end if;
    if coalesce(p_blocks, 1) <> 1 then
      raise exception 'booking_invalid_blocks' using errcode = '22023';
    end if;
    total_duration := base_duration;
  else
    base_duration := selected_business.fixed_duration_minutes;
    if base_duration is null or base_duration <= 0 then
      raise exception 'booking_invalid_duration' using errcode = '22023';
    end if;
    if selected_business.duration_mode = 'fixed' and coalesce(p_blocks, 1) <> 1 then
      raise exception 'booking_invalid_blocks' using errcode = '22023';
    end if;
    if selected_business.duration_mode = 'fixed_multiple' and (p_blocks is null or p_blocks < 1) then
      raise exception 'booking_invalid_blocks' using errcode = '22023';
    end if;
    total_duration := base_duration * coalesce(p_blocks, 1);
  end if;

  if p_date is null or p_start_time is null or p_date < local_now::date
    or (p_date = local_now::date and p_date + p_start_time <= local_now) then
    raise exception 'booking_invalid_date' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.business_hours as business_hour
    where business_hour.business_id = selected_business.id
      and business_hour.weekday = extract(dow from p_date)::integer
      and business_hour.active
  ) then
    raise exception 'booking_business_closed' using errcode = '22023';
  end if;

  calculated_end := (p_date + p_start_time + make_interval(mins => total_duration))::time;
  if not exists (
    select 1
    from public.business_hours as business_hour
    where business_hour.business_id = selected_business.id
      and business_hour.weekday = extract(dow from p_date)::integer
      and business_hour.active
      and p_start_time >= business_hour.start_time
      and p_date + p_start_time + make_interval(mins => total_duration)
        <= p_date + business_hour.end_time
      and mod((extract(epoch from ((p_date + p_start_time) - (p_date + business_hour.start_time))) / 60)::integer, base_duration) = 0
  ) then
    raise exception 'booking_outside_business_hours' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(selected_business.id::text || ':' || p_date::text, 0)
  );

  if exists (
    select 1
    from public.appointments as appointment
    where appointment.business_id = selected_business.id
      and appointment.appointment_date = p_date
      and appointment.status <> 'cancelled'
      and coalesce(appointment.group_1_option_id, appointment.business_id)
        = coalesce(selected_group_1, selected_business.id)
      and p_start_time < appointment.end_time
      and calculated_end > appointment.start_time
  ) then
    raise exception 'booking_conflict' using errcode = '23P01';
  end if;

  begin
    insert into public.appointments (
      business_id, group_1_option_id, group_2_option_id, customer_name,
      customer_whatsapp, appointment_date, start_time, end_time,
      duration_minutes, status, created_by
    ) values (
      selected_business.id, selected_group_1, selected_group_2,
      trim(p_customer_name), normalized_whatsapp, p_date, p_start_time,
      calculated_end, total_duration, 'scheduled', null
    );
  exception when exclusion_violation then
    raise exception 'booking_conflict' using errcode = '23P01';
  end;

  return jsonb_build_object(
    'business', jsonb_build_object(
      'name', selected_business.name,
      'slug', selected_business.slug,
      'logo_url', selected_business.logo_url
    ),
    'group_1', case when selected_group_1 is null then null else jsonb_build_object('label', group_1_label, 'name', group_1_name) end,
    'group_2', case when selected_group_2 is null then null else jsonb_build_object('label', group_2_label, 'name', group_2_name) end,
    'appointment_date', p_date,
    'start_time', p_start_time,
    'end_time', calculated_end,
    'duration_minutes', total_duration,
    'customer_name', trim(p_customer_name)
  );
end;
$$;

comment on function public.get_booking_availability(text, date, uuid, uuid) is
  'Returns slots generated independently inside every active opening window; block counts never cross a window boundary.';
comment on function public.create_public_appointment(text, uuid, uuid, date, time, integer, text, text) is
  'Creates an appointment only when its full duration fits one active opening window, then applies the existing concurrency rules.';
