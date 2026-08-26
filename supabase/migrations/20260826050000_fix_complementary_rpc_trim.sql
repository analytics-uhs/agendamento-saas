-- Correct function resolution in the public complementary RPCs. The previous
-- migration is already applied and remains immutable.

create or replace function public.get_public_complementary_availability(
  p_slug text,
  p_date date,
  p_start_time time default null,
  p_end_time time default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  selected_business_id uuid;
  selected_group record;
  local_now timestamp := pg_catalog.now() at time zone 'America/Sao_Paulo';
  requested_period tsrange;
  window_valid boolean;
  options jsonb;
begin
  select business.id
  into selected_business_id
  from public.businesses as business
  where business.slug = pg_catalog.lower(pg_catalog.btrim(p_slug))
    and business.active;

  if selected_business_id is null or p_date is null then
    return jsonb_build_object('configured', false, 'options', '[]'::jsonb);
  end if;

  select booking_group.id, booking_group.label, booking_group.intent_name,
    booking_group.occupancy_mode
  into selected_group
  from public.booking_groups as booking_group
  where booking_group.business_id = selected_business_id
    and booking_group.position = 3
    and booking_group.active;

  if not found then
    return jsonb_build_object('configured', false, 'options', '[]'::jsonb);
  end if;

  if selected_group.occupancy_mode = 'day'::public.booking_group_occupancy_mode
    and (p_start_time is not null or p_end_time is not null)
  then
    raise exception 'reservation_invalid_interval' using errcode = '22023';
  end if;

  if selected_group.occupancy_mode = 'time_slot'::public.booking_group_occupancy_mode
    and (
      p_start_time is null
      or p_end_time is null
      or p_start_time >= private.normalize_end_of_day_time(p_start_time, p_end_time)
    )
  then
    raise exception 'reservation_invalid_interval' using errcode = '22023';
  end if;

  window_valid := p_date >= local_now::date
    and private.complementary_public_window_is_valid(
      selected_business_id,
      selected_group.occupancy_mode,
      p_date,
      p_start_time,
      p_end_time
    )
    and (
      selected_group.occupancy_mode = 'day'::public.booking_group_occupancy_mode
      or p_date > local_now::date
      or p_date + p_start_time > local_now
    );

  requested_period := private.complementary_period(
    selected_group.occupancy_mode,
    p_date,
    p_start_time,
    p_end_time
  );

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'option_id', booking_option.id,
      'name', booking_option.name,
      'available', window_valid and not exists (
        select 1
        from public.resource_allocations as allocation
        where allocation.business_id = selected_business_id
          and allocation.option_id = booking_option.id
          and allocation.active
          and allocation.occupied_period && requested_period
      )
    ) order by booking_option.sort_order, booking_option.name
  ), '[]'::jsonb)
  into options
  from public.booking_options as booking_option
  where booking_option.business_id = selected_business_id
    and booking_option.group_id = selected_group.id
    and booking_option.active;

  return jsonb_build_object(
    'configured', true,
    'group_name', selected_group.label,
    'intent_name', selected_group.intent_name,
    'occupancy_mode', selected_group.occupancy_mode,
    'reservation_date', p_date,
    'start_time', case when selected_group.occupancy_mode = 'time_slot' then p_start_time else null end,
    'end_time', case when selected_group.occupancy_mode = 'time_slot' then p_end_time else null end,
    'options', options
  );
end;
$$;


create or replace function public.create_public_reservation(
  p_slug text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_business record;
  selected_group record;
  selected_option record;
  primary_payload jsonb;
  complementary_payload jsonb;
  primary_result jsonb;
  has_primary boolean;
  has_complementary boolean;
  primary_date date;
  complementary_date date;
  reservation_date date;
  primary_start_time time;
  complementary_start_time time;
  complementary_end_time time;
  complementary_mode public.booking_group_occupancy_mode;
  primary_blocks integer;
  normalized_whatsapp text := pg_catalog.regexp_replace(
    coalesce(p_payload ->> 'customer_whatsapp', ''), '\D', '', 'g'
  );
  customer_name text := pg_catalog.btrim(coalesce(p_payload ->> 'customer_name', ''));
  new_reservation_id uuid;
  new_resource_id uuid;
  new_appointment_id uuid;
  local_now timestamp := pg_catalog.now() at time zone 'America/Sao_Paulo';
begin
  if coalesce(jsonb_typeof(p_payload), '') <> 'object'
    or exists (
      select 1 from jsonb_object_keys(p_payload) as key(name)
      where key.name not in ('customer_name', 'customer_whatsapp', 'primary', 'complementary')
    )
  then
    raise exception 'reservation_payload_invalid' using errcode = '22023';
  end if;

  has_primary := p_payload ? 'primary' and jsonb_typeof(p_payload -> 'primary') = 'object';
  has_complementary := p_payload ? 'complementary'
    and jsonb_typeof(p_payload -> 'complementary') = 'object';

  if not has_primary and not has_complementary then
    raise exception 'reservation_payload_invalid' using errcode = '22023';
  end if;
  if char_length(customer_name) not between 2 and 120 then
    raise exception 'reservation_invalid_customer_name' using errcode = '22023';
  end if;
  if char_length(normalized_whatsapp) not between 10 and 15 then
    raise exception 'reservation_invalid_whatsapp' using errcode = '22023';
  end if;

  select business.id, business.name, business.slug, business.logo_url
  into selected_business
  from public.businesses as business
  where business.slug = pg_catalog.lower(pg_catalog.btrim(p_slug))
    and business.active;
  if not found then
    raise exception 'reservation_business_unavailable' using errcode = '22023';
  end if;

  if has_primary then
    primary_payload := p_payload -> 'primary';
    if exists (
      select 1 from jsonb_object_keys(primary_payload) as key(name)
      where key.name not in (
        'group_1_option_id', 'group_2_option_id', 'date', 'start_time', 'blocks'
      )
    ) then
      raise exception 'reservation_payload_invalid' using errcode = '22023';
    end if;
    begin
      primary_date := (primary_payload ->> 'date')::date;
      primary_start_time := (primary_payload ->> 'start_time')::time;
      primary_blocks := coalesce((primary_payload ->> 'blocks')::integer, 1);
    exception when invalid_text_representation or datetime_field_overflow then
      raise exception 'reservation_payload_invalid' using errcode = '22023';
    end;
    if primary_date is null or primary_start_time is null or primary_blocks < 1 then
      raise exception 'reservation_payload_invalid' using errcode = '22023';
    end if;
    reservation_date := primary_date;
  end if;

  if has_complementary then
    complementary_payload := p_payload -> 'complementary';
    if exists (
      select 1 from jsonb_object_keys(complementary_payload) as key(name)
      where key.name not in ('option_id', 'occupancy_mode', 'date', 'start_time', 'end_time')
    ) then
      raise exception 'reservation_payload_invalid' using errcode = '22023';
    end if;
    begin
      complementary_date := (complementary_payload ->> 'date')::date;
      complementary_mode := (complementary_payload ->> 'occupancy_mode')::public.booking_group_occupancy_mode;
      complementary_start_time := nullif(complementary_payload ->> 'start_time', '')::time;
      complementary_end_time := nullif(complementary_payload ->> 'end_time', '')::time;
    exception when invalid_text_representation or datetime_field_overflow then
      raise exception 'reservation_payload_invalid' using errcode = '22023';
    end;
    if complementary_date is null or nullif(complementary_payload ->> 'option_id', '') is null then
      raise exception 'reservation_payload_invalid' using errcode = '22023';
    end if;
    if reservation_date is not null and reservation_date <> complementary_date then
      raise exception 'reservation_components_date_mismatch' using errcode = '22023';
    end if;
    reservation_date := complementary_date;

    select booking_group.id, booking_group.label, booking_group.occupancy_mode
    into selected_group
    from public.booking_groups as booking_group
    where booking_group.business_id = selected_business.id
      and booking_group.position = 3
      and booking_group.active;
    if not found then
      raise exception 'reservation_complementary_unavailable' using errcode = '22023';
    end if;
    if complementary_mode is distinct from selected_group.occupancy_mode then
      raise exception 'reservation_complementary_mode_invalid' using errcode = '22023';
    end if;

    begin
      select booking_option.id, booking_option.name
      into selected_option
      from public.booking_options as booking_option
      where booking_option.id = (complementary_payload ->> 'option_id')::uuid
        and booking_option.business_id = selected_business.id
        and booking_option.group_id = selected_group.id
        and booking_option.active;
    exception when invalid_text_representation then
      raise exception 'reservation_complementary_option_invalid' using errcode = '22023';
    end;
    if not found then
      raise exception 'reservation_complementary_option_invalid' using errcode = '22023';
    end if;

    if complementary_date < local_now::date then
      raise exception 'reservation_invalid_date' using errcode = '22023';
    end if;
    if complementary_mode = 'day'::public.booking_group_occupancy_mode
      and (complementary_start_time is not null or complementary_end_time is not null)
    then
      raise exception 'reservation_invalid_interval' using errcode = '22023';
    end if;
    if complementary_mode = 'time_slot'::public.booking_group_occupancy_mode
      and (
        complementary_start_time is null
        or complementary_end_time is null
        or complementary_start_time >= private.normalize_end_of_day_time(
          complementary_start_time, complementary_end_time
        )
        or (
          complementary_date = local_now::date
          and complementary_date + complementary_start_time <= local_now
        )
      )
    then
      raise exception 'reservation_invalid_interval' using errcode = '22023';
    end if;
    if not private.complementary_public_window_is_valid(
      selected_business.id,
      complementary_mode,
      complementary_date,
      complementary_start_time,
      complementary_end_time
    ) then
      raise exception 'reservation_outside_business_hours' using errcode = '22023';
    end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      selected_business.id::text || ':' || reservation_date::text,
      0
    )
  );
  if has_complementary then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        selected_business.id::text || ':' || selected_option.id::text || ':' || reservation_date::text,
        0
      )
    );
  end if;

  new_reservation_id := private.create_reservation(
    selected_business.id,
    customer_name,
    normalized_whatsapp,
    'public'::public.appointment_source,
    null
  );

  if has_primary then
    perform pg_catalog.set_config('app.reservation_id', new_reservation_id::text, true);
    begin
      primary_result := public.create_public_appointment(
        p_slug,
        nullif(primary_payload ->> 'group_1_option_id', '')::uuid,
        nullif(primary_payload ->> 'group_2_option_id', '')::uuid,
        primary_date,
        primary_start_time,
        primary_blocks,
        customer_name,
        normalized_whatsapp
      );
    exception when exclusion_violation then
      raise exception 'reservation_primary_conflict' using errcode = '23P01';
    when invalid_text_representation then
      raise exception 'reservation_payload_invalid' using errcode = '22023';
    end;
    perform pg_catalog.set_config('app.reservation_id', '', true);

    select appointment.id into new_appointment_id
    from public.appointments as appointment
    where appointment.reservation_id = new_reservation_id
      and appointment.business_id = selected_business.id;
    if new_appointment_id is null then
      raise exception 'reservation_primary_creation_failed' using errcode = '23503';
    end if;
  end if;

  if has_complementary then
    if exists (
      select 1
      from public.resource_allocations as allocation
      where allocation.business_id = selected_business.id
        and allocation.option_id = selected_option.id
        and allocation.active
        and allocation.occupied_period && private.complementary_period(
          complementary_mode,
          complementary_date,
          complementary_start_time,
          complementary_end_time
        )
    ) then
      raise exception 'reservation_complementary_conflict' using errcode = '23P01';
    end if;

    begin
      new_resource_id := private.create_reservation_resource(
        new_reservation_id,
        selected_business.id,
        selected_group.id,
        selected_option.id,
        complementary_mode,
        complementary_date,
        complementary_start_time,
        complementary_end_time
      );
    exception when exclusion_violation then
      raise exception 'reservation_complementary_conflict' using errcode = '23P01';
    end;
  end if;

  return jsonb_build_object(
    'reservation_id', new_reservation_id,
    'date', reservation_date,
    'business', jsonb_build_object(
      'name', selected_business.name,
      'slug', selected_business.slug,
      'logo_url', selected_business.logo_url
    ),
    'customer_name', customer_name,
    'primary', case when not has_primary then null else jsonb_build_object(
      'group_1', primary_result -> 'group_1',
      'group_2', primary_result -> 'group_2',
      'start_time', primary_result -> 'start_time',
      'end_time', primary_result -> 'end_time',
      'duration_minutes', primary_result -> 'duration_minutes'
    ) end,
    'complementary', case when not has_complementary then null else jsonb_build_object(
      'group_name', selected_group.label,
      'option_name', selected_option.name,
      'occupancy_mode', complementary_mode,
      'start_time', complementary_start_time,
      'end_time', complementary_end_time
    ) end
  );
end;
$$;

