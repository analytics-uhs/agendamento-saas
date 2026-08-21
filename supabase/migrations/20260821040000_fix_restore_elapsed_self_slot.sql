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

  if not found or p_date is null then
    return '[]'::jsonb;
  end if;

  if p_exclude_appointment_id is not null then
    select appointment.start_time
    into excluded_terminal_start
    from public.appointments as appointment
    where appointment.id = p_exclude_appointment_id
      and appointment.business_id = selected_business.id
      and appointment.appointment_date = p_date
      and appointment.status in ('completed', 'cancelled', 'no_show');
  end if;

  if p_date < local_now::date and excluded_terminal_start is null then
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
      p_date + opening_window.end_time - pg_catalog.make_interval(mins => base_duration),
      pg_catalog.make_interval(mins => base_duration)
    ) as generated(candidate)
    where p_date > local_now::date
      or generated.candidate > local_now
      or (
        excluded_terminal_start is not null
        and generated.candidate::time = excluded_terminal_start
      )
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
              and (p_exclude_appointment_id is null or appointment.id <> p_exclude_appointment_id)
              and coalesce(appointment.group_1_option_id, appointment.business_id)
                = coalesce(selected_group_1, selected_business.id)
              and appointment.start_time < (candidate + pg_catalog.make_interval(mins => base_duration * block_count))::time
              and appointment.end_time > candidate::time
          )
        )
        else case when not exists (
          select 1
          from public.appointments as appointment
          where appointment.business_id = selected_business.id
            and appointment.appointment_date = p_date
            and appointment.status <> 'cancelled'
            and (p_exclude_appointment_id is null or appointment.id <> p_exclude_appointment_id)
            and coalesce(appointment.group_1_option_id, appointment.business_id)
              = coalesce(selected_group_1, selected_business.id)
            and appointment.start_time < (candidate + pg_catalog.make_interval(mins => base_duration))::time
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

revoke all on function private.get_booking_availability(text, date, uuid, uuid, uuid) from public;

comment on function private.get_booking_availability(text, date, uuid, uuid, uuid) is
  'Shared booking engine availability. Excludes one authorized appointment and preserves only that terminal occurrence original elapsed slot for status restoration.';
