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
      p_date + opening_window.end_time - pg_catalog.make_interval(mins => base_duration),
      pg_catalog.make_interval(mins => base_duration)
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

create or replace function public.get_booking_availability(
  p_slug text,
  p_date date,
  p_group_1_option_id uuid,
  p_group_2_option_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.get_booking_availability(
    p_slug,
    p_date,
    p_group_1_option_id,
    p_group_2_option_id,
    null
  );
$$;

revoke all on function public.get_booking_availability(text, date, uuid, uuid) from public;
grant execute on function public.get_booking_availability(text, date, uuid, uuid) to anon, authenticated;

create or replace function public.set_appointment_status(
  p_appointment_id uuid,
  p_status public.appointment_status
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  selected record;
  available jsonb;
  selected_slot jsonb;
  base_duration integer;
  selected_blocks integer;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select appointment.*, business.slug
  into selected
  from public.appointments appointment
  join public.businesses business on business.id = appointment.business_id
  join public.business_members membership
    on membership.business_id = appointment.business_id
   and membership.user_id = current_user_id
   and membership.role in ('owner', 'admin')
  where appointment.id = p_appointment_id
  for update of appointment;

  if not found then
    raise exception 'appointment_not_found' using errcode = '42501';
  end if;

  if selected.status = 'scheduled'::public.appointment_status then
    if p_status not in ('completed', 'cancelled', 'no_show') then
      raise exception 'appointment_invalid_status_transition' using errcode = '22023';
    end if;
  elsif selected.status in ('completed', 'cancelled', 'no_show') then
    if p_status <> 'scheduled'::public.appointment_status then
      raise exception 'appointment_invalid_status_transition' using errcode = '22023';
    end if;
  else
    raise exception 'appointment_invalid_status_transition' using errcode = '22023';
  end if;

  if p_status = 'scheduled'::public.appointment_status then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(selected.business_id::text || ':' || selected.appointment_date::text, 0)
    );

    available := private.get_booking_availability(
      selected.slug,
      selected.appointment_date,
      selected.group_1_option_id,
      selected.group_2_option_id,
      selected.id
    );
    select item into selected_slot
    from pg_catalog.jsonb_array_elements(available) item
    where left(item->>'start_time', 5) = left(selected.start_time::text, 5)
    limit 1;

    if selected_slot is null then
      raise exception 'appointment_restore_conflict' using errcode = '23P01';
    end if;
    base_duration := (selected_slot->>'duration_minutes')::integer;
    if base_duration <= 0 or selected.duration_minutes % base_duration <> 0 then
      raise exception 'appointment_restore_conflict' using errcode = '23P01';
    end if;
    selected_blocks := selected.duration_minutes / base_duration;
    if selected_blocks < 1
      or selected_blocks > (selected_slot->>'max_blocks')::integer then
      raise exception 'appointment_restore_conflict' using errcode = '23P01';
    end if;

    perform pg_catalog.set_config('app.appointment_restore', 'true', true);
  end if;

  update public.appointments set status = p_status where id = selected.id;
  if p_status = 'scheduled'::public.appointment_status then
    perform pg_catalog.set_config('app.appointment_restore', 'false', true);
  end if;
  return true;
exception when exclusion_violation or unique_violation then
  raise exception 'appointment_restore_conflict' using errcode = '23P01';
end;
$$;

revoke all on function public.set_appointment_status(uuid, public.appointment_status) from public;
grant execute on function public.set_appointment_status(uuid, public.appointment_status) to authenticated;

create or replace function public.get_admin_appointment_edit_availability(
  p_appointment_id uuid,
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
  current_user_id uuid := (select auth.uid());
  selected record;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select appointment.id, appointment.status, business.slug
  into selected
  from public.appointments appointment
  join public.businesses business on business.id = appointment.business_id
  join public.business_members membership
    on membership.business_id = appointment.business_id
   and membership.user_id = current_user_id
   and membership.role in ('owner', 'admin')
  where appointment.id = p_appointment_id;

  if not found then
    raise exception 'appointment_not_found' using errcode = '42501';
  end if;
  if selected.status <> 'scheduled'::public.appointment_status then
    raise exception 'appointment_invalid_status_transition' using errcode = '22023';
  end if;

  return private.get_booking_availability(
    selected.slug,
    p_date,
    p_group_1_option_id,
    p_group_2_option_id,
    selected.id
  );
end;
$$;

create or replace function public.update_admin_appointment_occurrence(
  p_appointment_id uuid,
  p_group_1_option_id uuid,
  p_group_2_option_id uuid,
  p_date date,
  p_start_time time,
  p_blocks integer,
  p_customer_name text,
  p_customer_whatsapp text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  selected record;
  available jsonb;
  selected_slot jsonb;
  normalized_whatsapp text;
  total_duration integer;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_blocks is null or p_blocks < 1 or trim(coalesce(p_customer_name, '')) = '' then
    raise exception 'booking_invalid_input' using errcode = '22023';
  end if;
  normalized_whatsapp := pg_catalog.regexp_replace(coalesce(p_customer_whatsapp, ''), '\D', '', 'g');
  if pg_catalog.length(normalized_whatsapp) < 10 or pg_catalog.length(normalized_whatsapp) > 15 then
    raise exception 'booking_invalid_whatsapp' using errcode = '22023';
  end if;

  select appointment.*, business.slug
  into selected
  from public.appointments appointment
  join public.businesses business on business.id = appointment.business_id
  join public.business_members membership
    on membership.business_id = appointment.business_id
   and membership.user_id = current_user_id
   and membership.role in ('owner', 'admin')
  where appointment.id = p_appointment_id
  for update of appointment;

  if not found then
    raise exception 'appointment_not_found' using errcode = '42501';
  end if;
  if selected.status <> 'scheduled'::public.appointment_status then
    raise exception 'appointment_invalid_status_transition' using errcode = '22023';
  end if;

  available := private.get_booking_availability(
    selected.slug,
    p_date,
    p_group_1_option_id,
    p_group_2_option_id,
    selected.id
  );
  select item into selected_slot
  from pg_catalog.jsonb_array_elements(available) item
  where left(item->>'start_time', 5) = left(p_start_time::text, 5)
  limit 1;

  if selected_slot is null or p_blocks > (selected_slot->>'max_blocks')::integer then
    raise exception 'booking_conflict' using errcode = '23P01';
  end if;
  total_duration := (selected_slot->>'duration_minutes')::integer * p_blocks;

  update public.appointments
  set group_1_option_id = p_group_1_option_id,
      group_2_option_id = p_group_2_option_id,
      customer_name = trim(p_customer_name),
      customer_whatsapp = normalized_whatsapp,
      appointment_date = p_date,
      start_time = p_start_time,
      end_time = p_start_time + pg_catalog.make_interval(mins => total_duration),
      duration_minutes = total_duration
  where id = selected.id;

  return true;
exception when exclusion_violation then
  raise exception 'booking_conflict' using errcode = '23P01';
end;
$$;

revoke all on function public.update_admin_appointment_occurrence(uuid, uuid, uuid, date, time, integer, text, text) from public;
grant execute on function public.update_admin_appointment_occurrence(uuid, uuid, uuid, date, time, integer, text, text) to authenticated;
revoke all on function public.get_admin_appointment_edit_availability(uuid, date, uuid, uuid) from public;
grant execute on function public.get_admin_appointment_edit_availability(uuid, date, uuid, uuid) to authenticated;

comment on function private.get_booking_availability(text, date, uuid, uuid, uuid) is
  'Shared booking engine availability implementation. Administrative editing may exclude exactly one authorized appointment; public availability never excludes one.';
comment on function public.set_appointment_status(uuid, public.appointment_status) is
  'Moves scheduled appointments to terminal statuses and restores one terminal occurrence through the shared booking engine with explicit self-exclusion.';
comment on function public.get_admin_appointment_edit_availability(uuid, date, uuid, uuid) is
  'Returns edit availability for owner/admin while excluding only the selected scheduled appointment and without mutating it.';
comment on function public.update_admin_appointment_occurrence(uuid, uuid, uuid, date, time, integer, text, text) is
  'Atomically edits one scheduled occurrence using the shared booking engine with self-exclusion; the series and direct UPDATE grants remain unchanged.';
