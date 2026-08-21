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
    ) then
    raise exception 'appointment_invalid_status_transition' using errcode = '22023';
  end if;
  return new;
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

  perform pg_catalog.set_config('app.appointment_edit', 'true', true);
  update public.appointments set status = 'cancelled' where id = p_appointment_id;

  available := public.get_booking_availability(
    selected.slug, p_date, p_group_1_option_id, p_group_2_option_id
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
      duration_minutes = total_duration,
      status = 'scheduled'
  where id = p_appointment_id;

  return true;
exception when exclusion_violation then
  raise exception 'booking_conflict' using errcode = '23P01';
end;
$$;

create or replace function public.get_admin_appointment_edit_availability(
  p_appointment_id uuid,
  p_date date,
  p_group_1_option_id uuid,
  p_group_2_option_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  selected record;
  available jsonb;
begin
  select appointment.id, appointment.status, business.slug
  into selected
  from public.appointments appointment
  join public.businesses business on business.id = appointment.business_id
  join public.business_members membership
    on membership.business_id = appointment.business_id
   and membership.user_id = current_user_id
   and membership.role in ('owner', 'admin')
  where appointment.id = p_appointment_id
  for update of appointment;
  if not found then raise exception 'appointment_not_found' using errcode = '42501'; end if;
  if selected.status <> 'scheduled'::public.appointment_status then raise exception 'appointment_invalid_status_transition' using errcode = '22023'; end if;
  perform pg_catalog.set_config('app.appointment_edit', 'true', true);
  update public.appointments set status = 'cancelled' where id = p_appointment_id;
  available := public.get_booking_availability(selected.slug, p_date, p_group_1_option_id, p_group_2_option_id);
  update public.appointments set status = 'scheduled' where id = p_appointment_id;
  return available;
end;
$$;

revoke all on function public.update_admin_appointment_occurrence(uuid, uuid, uuid, date, time, integer, text, text) from public;
grant execute on function public.update_admin_appointment_occurrence(uuid, uuid, uuid, date, time, integer, text, text) to authenticated;
revoke all on function public.get_admin_appointment_edit_availability(uuid, date, uuid, uuid) from public;
grant execute on function public.get_admin_appointment_edit_availability(uuid, date, uuid, uuid) to authenticated;

comment on function public.update_admin_appointment_occurrence(uuid, uuid, uuid, date, time, integer, text, text) is
  'Edits one scheduled occurrence only. Authorization, availability and duration are validated transactionally without granting direct UPDATE.';
