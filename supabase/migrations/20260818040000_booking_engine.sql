-- Public availability and atomic booking engine.

create extension if not exists btree_gist with schema extensions;

alter table public.appointments
add constraint appointments_no_overlapping_active_bookings
exclude using gist (
  business_id with =,
  (coalesce(group_1_option_id, business_id)) with =,
  (tsrange(
    appointment_date + start_time,
    appointment_date + end_time,
    '[)'
  )) with &&
)
where (status <> 'cancelled'::public.appointment_status);

comment on constraint appointments_no_overlapping_active_bookings on public.appointments is
  'Prevents overlapping non-cancelled appointments for the same business resource. A null Group 1 uses the business as the resource.';

-- Include the business id required by the availability RPC while preserving
-- the same narrow anonymous read model.
create or replace function public.get_public_booking_page(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'business', jsonb_build_object(
      'id', business.id,
      'name', business.name,
      'slug', business.slug,
      'whatsapp', business.whatsapp,
      'logo_url', business.logo_url
    ),
    'groups', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'position', booking_group.position,
          'label', booking_group.label,
          'required', booking_group.required,
          'options', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', booking_option.id,
                'name', booking_option.name,
                'duration_minutes', booking_option.duration_minutes
              )
              order by booking_option.sort_order, booking_option.name
            )
            from public.booking_options as booking_option
            where booking_option.business_id = business.id
              and booking_option.group_id = booking_group.id
              and booking_option.active
          ), '[]'::jsonb)
        )
        order by booking_group.sort_order, booking_group.position
      )
      from public.booking_groups as booking_group
      where booking_group.business_id = business.id
        and booking_group.active
    ), '[]'::jsonb),
    'hours', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'weekday', business_hour.weekday,
          'start_time', business_hour.start_time,
          'end_time', business_hour.end_time
        )
        order by business_hour.weekday
      )
      from public.business_hours as business_hour
      where business_hour.business_id = business.id
        and business_hour.active
    ), '[]'::jsonb),
    'settings', jsonb_build_object(
      'duration_mode', settings.duration_mode,
      'fixed_duration_minutes', settings.fixed_duration_minutes,
      'allow_multiple_blocks', settings.allow_multiple_blocks,
      'palette', settings.palette,
      'theme_preference', settings.theme_preference
    )
  )
  from public.businesses as business
  join public.business_settings as settings on settings.business_id = business.id
  where business.slug = lower(trim(p_slug))
    and business.active
  limit 1;
$$;

revoke all on function public.get_public_booking_page(text) from public;
grant execute on function public.get_public_booking_page(text) to anon, authenticated;

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
  opening_time time;
  closing_time time;
  base_duration integer;
  local_now timestamp := now() at time zone 'America/Sao_Paulo';
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

  select start_time, end_time into opening_time, closing_time
  from public.business_hours
  where business_id = selected_business.id
    and weekday = extract(dow from p_date)::integer
    and active;
  if not found then
    return '[]'::jsonb;
  end if;

  with candidates as (
    select candidate
    from generate_series(
      p_date + opening_time,
      p_date + closing_time - make_interval(mins => base_duration),
      make_interval(mins => base_duration)
    ) as generated(candidate)
    where p_date > local_now::date or candidate > local_now
  ), available as (
    select
      candidate,
      case
        when selected_business.duration_mode = 'fixed_multiple' then (
          select max(block_count)
          from generate_series(
            1,
            floor(extract(epoch from ((p_date + closing_time) - candidate)) / 60 / base_duration)::integer
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

revoke all on function public.get_booking_availability(text, date, uuid, uuid) from public;
grant execute on function public.get_booking_availability(text, date, uuid, uuid) to anon, authenticated;

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
  opening_time time;
  closing_time time;
  base_duration integer;
  total_duration integer;
  calculated_end time;
  normalized_whatsapp text := regexp_replace(coalesce(p_customer_whatsapp, ''), '\D', '', 'g');
  local_now timestamp := now() at time zone 'America/Sao_Paulo';
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

  select start_time, end_time into opening_time, closing_time
  from public.business_hours
  where business_id = selected_business.id
    and weekday = extract(dow from p_date)::integer
    and active;
  if not found then
    raise exception 'booking_business_closed' using errcode = '22023';
  end if;

  calculated_end := (p_date + p_start_time + make_interval(mins => total_duration))::time;
  if p_start_time < opening_time
    or p_date + p_start_time + make_interval(mins => total_duration) > p_date + closing_time
    or mod((extract(epoch from ((p_date + p_start_time) - (p_date + opening_time))) / 60)::integer, base_duration) <> 0 then
    raise exception 'booking_outside_business_hours' using errcode = '22023';
  end if;

  -- Serialize bookings for this business/date before the final conflict check.
  -- The exclusion constraint remains the last line of defense for equal resources.
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
      business_id,
      group_1_option_id,
      group_2_option_id,
      customer_name,
      customer_whatsapp,
      appointment_date,
      start_time,
      end_time,
      duration_minutes,
      status,
      created_by
    ) values (
      selected_business.id,
      selected_group_1,
      selected_group_2,
      trim(p_customer_name),
      normalized_whatsapp,
      p_date,
      p_start_time,
      calculated_end,
      total_duration,
      'scheduled',
      null
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

revoke all on function public.create_public_appointment(text, uuid, uuid, date, time, integer, text, text) from public;
grant execute on function public.create_public_appointment(text, uuid, uuid, date, time, integer, text, text) to anon, authenticated;

comment on function public.get_booking_availability(text, date, uuid, uuid) is
  'Returns only available start times, base durations, and consecutive block counts. Never exposes appointments or customer data.';
comment on function public.create_public_appointment(text, uuid, uuid, date, time, integer, text, text) is
  'Validates and atomically creates an anonymous appointment. Concurrency is enforced by the exclusion constraint.';
