create or replace function public.materialize_recurring_appointments(
  p_series_id uuid,
  p_horizon_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  local_now timestamp := pg_catalog.now() at time zone 'America/Sao_Paulo';
  selected_series public.appointment_series%rowtype;
  business_slug text;
  effective_horizon date;
  candidate record;
  availability jsonb;
  available_slot jsonb;
  conflicts jsonb := '[]'::jsonb;
  created_count integer := 0;
  previous_source text := pg_catalog.current_setting('app.appointment_source', true);
  previous_series text := pg_catalog.current_setting('app.appointment_series_id', true);
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select series.*
  into selected_series
  from public.appointment_series as series
  where series.id = p_series_id
    and (select private.has_business_role(
      series.business_id,
      array['owner', 'admin']::public.business_role[]
    ))
  for update of series;

  if not found then
    raise exception 'appointment_series_not_found' using errcode = '42501';
  end if;

  select business.slug
  into business_slug
  from public.businesses as business
  where business.id = selected_series.business_id;

  if not selected_series.active then
    return jsonb_build_object(
      'series_id', selected_series.id,
      'created_count', 0,
      'active', false
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('appointment-series:' || selected_series.id::text, 0)
  );

  if selected_series.repeat_count is null then
    effective_horizon := least(
      coalesce(p_horizon_date, local_now::date + 90),
      local_now::date + 90
    );
  else
    effective_horizon := least(
      coalesce(
        p_horizon_date,
        selected_series.starts_on + ((selected_series.repeat_count - 1) * 7)
      ),
      selected_series.starts_on + ((selected_series.repeat_count - 1) * 7)
    );
  end if;

  for candidate in
    with occurrences as (
      select
        occurrence_number,
        selected_series.starts_on + ((occurrence_number - 1) * 7) as appointment_date
      from generate_series(
        1,
        case
          when selected_series.repeat_count is not null then selected_series.repeat_count
          when effective_horizon < selected_series.starts_on then 0
          else ((effective_horizon - selected_series.starts_on) / 7) + 1
        end
      ) as occurrence_number
    )
    select occurrence_number, appointment_date
    from occurrences
    where appointment_date <= effective_horizon
      and (
        appointment_date > local_now::date
        or (
          appointment_date = local_now::date
          and selected_series.start_time > local_now::time
        )
      )
      and not exists (
        select 1
        from public.appointments as appointment
        where appointment.series_id = selected_series.id
          and appointment.appointment_date = occurrences.appointment_date
      )
    order by appointment_date
  loop
    availability := public.get_booking_availability(
      business_slug,
      candidate.appointment_date,
      selected_series.group_1_option_id,
      selected_series.group_2_option_id
    );

    select slot.value
    into available_slot
    from jsonb_array_elements(availability) as slot(value)
    where slot.value ->> 'start_time' = to_char(selected_series.start_time, 'HH24:MI')
      and (slot.value ->> 'max_blocks')::integer >= selected_series.blocks
      and (slot.value ->> 'duration_minutes')::integer * selected_series.blocks
        = selected_series.duration_minutes
    limit 1;

    if not found then
      conflicts := conflicts || jsonb_build_array(jsonb_build_object(
        'date', candidate.appointment_date,
        'start_time', to_char(selected_series.start_time, 'HH24:MI')
      ));
    end if;
  end loop;

  if jsonb_array_length(conflicts) > 0 then
    raise exception 'recurring_conflicts:%', conflicts::text
      using errcode = '23P01', detail = conflicts::text;
  end if;

  perform pg_catalog.set_config('app.appointment_source', 'admin', true);
  perform pg_catalog.set_config('app.appointment_series_id', selected_series.id::text, true);

  for candidate in
    with occurrences as (
      select
        occurrence_number,
        selected_series.starts_on + ((occurrence_number - 1) * 7) as appointment_date
      from generate_series(
        1,
        case
          when selected_series.repeat_count is not null then selected_series.repeat_count
          when effective_horizon < selected_series.starts_on then 0
          else ((effective_horizon - selected_series.starts_on) / 7) + 1
        end
      ) as occurrence_number
    )
    select occurrence_number, appointment_date
    from occurrences
    where appointment_date <= effective_horizon
      and (
        appointment_date > local_now::date
        or (
          appointment_date = local_now::date
          and selected_series.start_time > local_now::time
        )
      )
      and not exists (
        select 1
        from public.appointments as appointment
        where appointment.series_id = selected_series.id
          and appointment.appointment_date = occurrences.appointment_date
      )
    order by appointment_date
  loop
    perform public.create_public_appointment(
      business_slug,
      selected_series.group_1_option_id,
      selected_series.group_2_option_id,
      candidate.appointment_date,
      selected_series.start_time,
      selected_series.blocks,
      selected_series.customer_name,
      selected_series.customer_whatsapp
    );
    created_count := created_count + 1;
  end loop;

  perform pg_catalog.set_config('app.appointment_source', coalesce(previous_source, ''), true);
  perform pg_catalog.set_config('app.appointment_series_id', coalesce(previous_series, ''), true);

  return jsonb_build_object(
    'series_id', selected_series.id,
    'created_count', created_count,
    'active', true,
    'materialized_through', effective_horizon
  );
end;
$$;

create or replace function public.create_recurring_appointment_series(
  p_group_1_option_id uuid,
  p_group_2_option_id uuid,
  p_starts_on date,
  p_start_time time,
  p_blocks integer,
  p_customer_name text,
  p_customer_whatsapp text,
  p_repeat_count integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  local_now timestamp := pg_catalog.now() at time zone 'America/Sao_Paulo';
  selected_business record;
  base_duration integer;
  total_duration integer;
  normalized_whatsapp text := regexp_replace(coalesce(p_customer_whatsapp, ''), '\D', '', 'g');
  new_series_id uuid;
  materialization jsonb;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if p_repeat_count is not null and p_repeat_count < 2 then
    raise exception 'recurring_invalid_repeat_count' using errcode = '22023';
  end if;

  if p_starts_on is null or p_start_time is null
    or p_starts_on < local_now::date
    or (p_starts_on = local_now::date and p_start_time <= local_now::time) then
    raise exception 'booking_invalid_date' using errcode = '22023';
  end if;

  if p_repeat_count is null and p_starts_on > local_now::date + 90 then
    raise exception 'recurring_start_outside_horizon' using errcode = '22023';
  end if;

  select
    business.id,
    business.slug,
    settings.duration_mode,
    settings.fixed_duration_minutes
  into selected_business
  from public.business_members as membership
  join public.businesses as business
    on business.id = membership.business_id
   and business.active
  join public.business_settings as settings on settings.business_id = business.id
  where membership.user_id = current_user_id
    and membership.role in ('owner', 'admin')
  order by membership.created_at, membership.id
  limit 1;

  if not found then
    raise exception 'recurring_appointment_forbidden' using errcode = '42501';
  end if;

  if selected_business.duration_mode = 'group_2' then
    if coalesce(p_blocks, 1) <> 1 then
      raise exception 'booking_invalid_blocks' using errcode = '22023';
    end if;

    select booking_option.duration_minutes
    into base_duration
    from public.booking_options as booking_option
    join public.booking_groups as booking_group
      on booking_group.id = booking_option.group_id
     and booking_group.business_id = booking_option.business_id
    where booking_option.id = p_group_2_option_id
      and booking_option.business_id = selected_business.id
      and booking_option.active
      and booking_group.active
      and booking_group.position = 2;

    if not found or base_duration is null or base_duration <= 0 then
      raise exception 'booking_group_2_duration_required' using errcode = '22023';
    end if;
  else
    base_duration := selected_business.fixed_duration_minutes;
    if base_duration is null or base_duration <= 0 then
      raise exception 'booking_invalid_duration' using errcode = '22023';
    end if;
    if selected_business.duration_mode = 'fixed' and coalesce(p_blocks, 1) <> 1 then
      raise exception 'booking_invalid_blocks' using errcode = '22023';
    end if;
    if selected_business.duration_mode = 'fixed_multiple'
      and (p_blocks is null or p_blocks < 1) then
      raise exception 'booking_invalid_blocks' using errcode = '22023';
    end if;
  end if;

  total_duration := base_duration * coalesce(p_blocks, 1);

  insert into public.appointment_series (
    business_id,
    group_1_option_id,
    group_2_option_id,
    customer_name,
    customer_whatsapp,
    weekday,
    start_time,
    duration_minutes,
    blocks,
    starts_on,
    repeat_count,
    created_by
  ) values (
    selected_business.id,
    p_group_1_option_id,
    p_group_2_option_id,
    trim(p_customer_name),
    normalized_whatsapp,
    extract(dow from p_starts_on)::smallint,
    p_start_time,
    total_duration,
    coalesce(p_blocks, 1),
    p_starts_on,
    p_repeat_count,
    current_user_id
  )
  returning id into new_series_id;

  materialization := public.materialize_recurring_appointments(new_series_id, null);

  return jsonb_build_object(
    'series_id', new_series_id,
    'created_count', (materialization ->> 'created_count')::integer,
    'repeat_count', p_repeat_count,
    'permanent', p_repeat_count is null,
    'materialized_through', materialization ->> 'materialized_through'
  );
end;
$$;

create or replace function public.cancel_recurring_appointment(
  p_appointment_id uuid,
  p_scope text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  selected_appointment record;
  cancelled_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if p_scope is null or p_scope not in ('single', 'future') then
    raise exception 'recurring_invalid_cancel_scope' using errcode = '22023';
  end if;

  select
    appointment.id,
    appointment.series_id,
    appointment.status,
    appointment.appointment_date,
    appointment.start_time
  into selected_appointment
  from public.appointments as appointment
  join public.business_members as membership
    on membership.business_id = appointment.business_id
   and membership.user_id = current_user_id
   and membership.role in ('owner', 'admin')
  where appointment.id = p_appointment_id
  for update of appointment;

  if not found then
    raise exception 'appointment_not_found' using errcode = '42501';
  end if;

  if selected_appointment.series_id is null then
    raise exception 'recurring_appointment_required' using errcode = '22023';
  end if;

  if selected_appointment.status <> 'scheduled'::public.appointment_status then
    raise exception 'appointment_invalid_status_transition' using errcode = '22023';
  end if;

  if p_scope = 'single' then
    update public.appointments
    set status = 'cancelled'::public.appointment_status
    where id = selected_appointment.id;
    cancelled_count := 1;
  else
    perform 1
    from public.appointment_series
    where id = selected_appointment.series_id
    for update;

    update public.appointments
    set status = 'cancelled'::public.appointment_status
    where series_id = selected_appointment.series_id
      and status = 'scheduled'::public.appointment_status
      and (appointment_date, start_time) >= (
        selected_appointment.appointment_date,
        selected_appointment.start_time
      );
    get diagnostics cancelled_count = row_count;

    update public.appointment_series
    set active = false
    where id = selected_appointment.series_id;
  end if;

  return jsonb_build_object(
    'series_id', selected_appointment.series_id,
    'scope', p_scope,
    'cancelled_count', cancelled_count,
    'series_active', p_scope = 'single'
  );
end;
$$;

revoke all on function public.materialize_recurring_appointments(uuid, date) from public;
revoke all on function public.create_recurring_appointment_series(uuid, uuid, date, time, integer, text, text, integer) from public;
revoke all on function public.cancel_recurring_appointment(uuid, text) from public;

grant execute on function public.materialize_recurring_appointments(uuid, date) to authenticated;
grant execute on function public.create_recurring_appointment_series(uuid, uuid, date, time, integer, text, text, integer) to authenticated;
grant execute on function public.cancel_recurring_appointment(uuid, text) to authenticated;

comment on function public.materialize_recurring_appointments(uuid, date) is
  'Idempotently fills authorized weekly series through a controlled horizon by delegating every occurrence to create_public_appointment.';
comment on function public.create_recurring_appointment_series(uuid, uuid, date, time, integer, text, text, integer) is
  'Atomically creates an administrative weekly series and all initially planned occurrences, rolling back with every conflicting date when unavailable.';
comment on function public.cancel_recurring_appointment(uuid, text) is
  'Cancels one recurring occurrence or atomically cancels the selected and following scheduled occurrences while deactivating the series.';
