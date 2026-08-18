alter table public.appointments
add column reminder_sent_at timestamptz,
add column reminder_sent_by uuid references auth.users (id) on delete set null;

create or replace function public.mark_appointment_reminder_sent(
  p_appointment_id uuid
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_status public.appointment_status;
  sent_at timestamptz;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select appointment.status
  into current_status
  from public.appointments as appointment
  join public.business_members as membership
    on membership.business_id = appointment.business_id
   and membership.user_id = current_user_id
   and membership.role in ('owner', 'admin')
  where appointment.id = p_appointment_id;

  if not found then
    raise exception 'appointment_not_found' using errcode = '42501';
  end if;

  if current_status <> 'scheduled'::public.appointment_status then
    raise exception 'appointment_reminder_invalid_status' using errcode = '22023';
  end if;

  update public.appointments
  set
    reminder_sent_at = pg_catalog.now(),
    reminder_sent_by = current_user_id
  where id = p_appointment_id
  returning reminder_sent_at into sent_at;

  return sent_at;
end;
$$;

revoke all on function public.mark_appointment_reminder_sent(uuid) from public;
grant execute on function public.mark_appointment_reminder_sent(uuid) to authenticated;

comment on column public.appointments.reminder_sent_at is
  'Timestamp of the latest WhatsApp reminder action initiated from the admin interface; it does not confirm delivery.';
comment on column public.appointments.reminder_sent_by is
  'Authenticated owner/admin who initiated the latest WhatsApp reminder action.';
comment on function public.mark_appointment_reminder_sent(uuid) is
  'Records the latest reminder action for a scheduled appointment when the caller is an owner/admin of its business.';
