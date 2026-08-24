-- Preserve the administrative recurrence behavior introduced in the previous
-- migration while expressing the availability check without an unused target.

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
  current_user_id uuid := auth.uid();
  local_now timestamp := now() at time zone 'America/Sao_Paulo';
  selected_series public.appointment_series%rowtype;
  effective_horizon date;
  candidate record;
  availability jsonb;
  conflicts jsonb := '[]'::jsonb;
  created_count integer := 0;
  previous_source text := current_setting('app.appointment_source', true);
  previous_series text := current_setting('app.appointment_series_id', true);
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select series.* into selected_series
  from public.appointment_series series
  where series.id = p_series_id
    and private.has_business_role(
      series.business_id,
      array['owner', 'admin']::public.business_role[]
    )
  for update;

  if not found then
    raise exception 'appointment_series_not_found' using errcode = '42501';
  end if;
  if not selected_series.active then
    return jsonb_build_object(
      'series_id', selected_series.id,
      'created_count', 0,
      'active', false
    );
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('appointment-series:' || selected_series.id::text, 0)
  );

  effective_horizon := case
    when selected_series.repeat_count is null then
      least(coalesce(p_horizon_date, local_now::date + 90), local_now::date + 90)
    else least(
      coalesce(
        p_horizon_date,
        selected_series.starts_on + ((selected_series.repeat_count - 1) * 7)
      ),
      selected_series.starts_on + ((selected_series.repeat_count - 1) * 7)
    )
  end;

  for candidate in
    select selected_series.starts_on + ((number - 1) * 7) as appointment_date
    from generate_series(
      1,
      case
        when selected_series.repeat_count is not null then selected_series.repeat_count
        when effective_horizon < selected_series.starts_on then 0
        else ((effective_horizon - selected_series.starts_on) / 7) + 1
      end
    ) number
    where selected_series.starts_on + ((number - 1) * 7) <= effective_horizon
      and (
        selected_series.starts_on + ((number - 1) * 7) > local_now::date
        or (
          selected_series.starts_on + ((number - 1) * 7) = local_now::date
          and selected_series.start_time > local_now::time
        )
      )
      and not exists (
        select 1
        from public.appointments appointment
        where appointment.series_id = selected_series.id
          and appointment.appointment_date =
            selected_series.starts_on + ((number - 1) * 7)
      )
  loop
    availability := private.get_admin_booking_availability(
      selected_series.business_id,
      candidate.appointment_date,
      selected_series.group_1_option_id,
      selected_series.group_2_option_id,
      null
    );

    perform 1
    from jsonb_array_elements(availability) item
    where item->>'start_time' = to_char(selected_series.start_time, 'HH24:MI')
      and (item->>'max_blocks')::integer >= selected_series.blocks
      and (item->>'duration_minutes')::integer * selected_series.blocks =
        selected_series.duration_minutes
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

  perform set_config('app.appointment_source', 'admin', true);
  perform set_config('app.appointment_series_id', selected_series.id::text, true);

  for candidate in
    select selected_series.starts_on + ((number - 1) * 7) as appointment_date
    from generate_series(
      1,
      case
        when selected_series.repeat_count is not null then selected_series.repeat_count
        when effective_horizon < selected_series.starts_on then 0
        else ((effective_horizon - selected_series.starts_on) / 7) + 1
      end
    ) number
    where selected_series.starts_on + ((number - 1) * 7) <= effective_horizon
      and (
        selected_series.starts_on + ((number - 1) * 7) > local_now::date
        or (
          selected_series.starts_on + ((number - 1) * 7) = local_now::date
          and selected_series.start_time > local_now::time
        )
      )
      and not exists (
        select 1
        from public.appointments appointment
        where appointment.series_id = selected_series.id
          and appointment.appointment_date =
            selected_series.starts_on + ((number - 1) * 7)
      )
  loop
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
      selected_series.business_id,
      selected_series.group_1_option_id,
      selected_series.group_2_option_id,
      selected_series.customer_name,
      selected_series.customer_whatsapp,
      candidate.appointment_date,
      selected_series.start_time,
      selected_series.start_time + make_interval(mins => selected_series.duration_minutes),
      selected_series.duration_minutes,
      'scheduled'::public.appointment_status,
      current_user_id
    );
    created_count := created_count + 1;
  end loop;

  perform set_config('app.appointment_source', coalesce(previous_source, ''), true);
  perform set_config('app.appointment_series_id', coalesce(previous_series, ''), true);

  return jsonb_build_object(
    'series_id', selected_series.id,
    'created_count', created_count,
    'active', true,
    'materialized_through', effective_horizon
  );
end;
$$;

