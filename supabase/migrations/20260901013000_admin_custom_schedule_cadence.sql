-- Preserve outside-hours Admin booking without mixing the midnight phase
-- into an explicitly custom primary schedule. Public candidates are unchanged.

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
  custom_schedule boolean := false;
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

  select exists (
    select 1 from public.booking_options
    where id = selected_group_1 and business_id = p_business_id
      and schedule_mode = 'custom'
  ) into custom_schedule;

  with effective_windows as (
    select * from private.get_effective_primary_option_hours(p_business_id, selected_group_1, p_date)
  ), anchors as (
    -- Legacy business schedules retain their existing administrative cadence.
    select p_date::timestamp anchor
    where not p_enforce_hours
      and (not custom_schedule or not exists (select 1 from effective_windows))
    union
    -- Custom windows contribute their phase, extended backwards through the day.
    -- DISTINCT/UNION collapses windows sharing the same phase. Different phases
    -- are retained only when needed to preserve all configured opening anchors.
    select case when not p_enforce_hours and custom_schedule then
      p_date + make_interval(secs => mod(
        extract(epoch from effective_window.start_time), base_duration * 60
      )::double precision)
    else p_date + effective_window.start_time end
    from effective_windows effective_window
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
    union
    -- Editing/restoring a historical occurrence must not lose its saved time.
    select p_date + excluded_start, time '24:00'
    where not p_enforce_hours and excluded_start is not null
      and p_date + excluded_start + make_interval(mins => base_duration)
        <= p_date + time '24:00'
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
