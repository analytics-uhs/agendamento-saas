create or replace function private.validate_appointment_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
    and not (
      old.status = 'scheduled'::public.appointment_status
      and new.status in ('completed', 'cancelled', 'no_show')
    )
    and not (
      pg_catalog.current_setting('app.appointment_edit', true) = 'true'
      and old.status = 'cancelled'::public.appointment_status
      and new.status = 'scheduled'::public.appointment_status
    )
    and not (
      pg_catalog.current_setting('app.appointment_restore', true) = 'true'
      and old.status in ('completed', 'cancelled', 'no_show')
      and new.status = 'scheduled'::public.appointment_status
    ) then
    raise exception 'appointment_invalid_status_transition' using errcode = '22023';
  end if;
  return new;
end;
$$;

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
  settings record;
  group_1_active boolean;
  group_2_active boolean;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select appointment.*, business.active as business_active
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
    if not selected.business_active then
      raise exception 'appointment_restore_conflict' using errcode = '23P01';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(selected.business_id::text || ':' || selected.appointment_date::text, 0)
    );

    if not exists (
      select 1
      from public.business_hours hours
      where hours.business_id = selected.business_id
        and hours.weekday = extract(dow from selected.appointment_date)::integer
        and hours.active
        and selected.start_time >= hours.start_time
        and selected.end_time <= hours.end_time
    ) then
      raise exception 'appointment_restore_conflict' using errcode = '23P01';
    end if;

    select business_settings.duration_mode, business_settings.fixed_duration_minutes
    into settings
    from public.business_settings
    where business_settings.business_id = selected.business_id;
    if not found then
      raise exception 'appointment_restore_conflict' using errcode = '23P01';
    end if;

    select exists (
      select 1 from public.booking_groups
      where business_id = selected.business_id and position = 1 and active
    ) into group_1_active;
    select exists (
      select 1 from public.booking_groups
      where business_id = selected.business_id and position = 2 and active
    ) into group_2_active;

    if group_1_active <> (selected.group_1_option_id is not null)
      or (selected.group_1_option_id is not null and not exists (
        select 1
        from public.booking_options option
        join public.booking_groups booking_group on booking_group.id = option.group_id
        where option.id = selected.group_1_option_id
          and option.business_id = selected.business_id
          and option.active and booking_group.active and booking_group.position = 1
      ))
      or group_2_active <> (selected.group_2_option_id is not null)
      or (selected.group_2_option_id is not null and not exists (
        select 1
        from public.booking_options option
        join public.booking_groups booking_group on booking_group.id = option.group_id
        where option.id = selected.group_2_option_id
          and option.business_id = selected.business_id
          and option.active and booking_group.active and booking_group.position = 2
      )) then
      raise exception 'appointment_restore_conflict' using errcode = '23P01';
    end if;

    if settings.duration_mode = 'fixed'::public.duration_mode
      and selected.duration_minutes <> settings.fixed_duration_minutes then
      raise exception 'appointment_restore_conflict' using errcode = '23P01';
    elsif settings.duration_mode = 'fixed_multiple'::public.duration_mode
      and (settings.fixed_duration_minutes <= 0
        or selected.duration_minutes % settings.fixed_duration_minutes <> 0) then
      raise exception 'appointment_restore_conflict' using errcode = '23P01';
    elsif settings.duration_mode = 'group_2'::public.duration_mode
      and not exists (
        select 1 from public.booking_options option
        where option.id = selected.group_2_option_id
          and option.business_id = selected.business_id
          and option.active
          and option.duration_minutes = selected.duration_minutes
      ) then
      raise exception 'appointment_restore_conflict' using errcode = '23P01';
    end if;

    if exists (
      select 1
      from public.appointments appointment
      where appointment.id <> selected.id
        and appointment.business_id = selected.business_id
        and appointment.appointment_date = selected.appointment_date
        and appointment.status <> 'cancelled'::public.appointment_status
        and coalesce(appointment.group_1_option_id, appointment.business_id)
          = coalesce(selected.group_1_option_id, selected.business_id)
        and selected.start_time < appointment.end_time
        and selected.end_time > appointment.start_time
    ) then
      raise exception 'appointment_restore_conflict' using errcode = '23P01';
    end if;

    perform pg_catalog.set_config('app.appointment_restore', 'true', true);
  end if;

  update public.appointments set status = p_status where id = selected.id;
  if p_status = 'scheduled'::public.appointment_status then
    perform pg_catalog.set_config('app.appointment_restore', 'false', true);
  end if;
  return true;
exception
  when exclusion_violation or unique_violation then
    raise exception 'appointment_restore_conflict' using errcode = '23P01';
end;
$$;

revoke all on function public.set_appointment_status(uuid, public.appointment_status) from public;
grant execute on function public.set_appointment_status(uuid, public.appointment_status) to authenticated;

comment on function public.set_appointment_status(uuid, public.appointment_status) is
  'Moves scheduled appointments to terminal statuses and restores one terminal occurrence only after tenant, configuration, opening-window, duration, resource, and conflict validation.';
