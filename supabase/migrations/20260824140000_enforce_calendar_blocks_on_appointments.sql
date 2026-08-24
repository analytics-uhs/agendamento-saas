-- Enforce the cross-entity invariant at the appointments table boundary.
-- This complements availability (UX) and protects every existing appointment
-- RPC, including public/admin creation, editing, and status restoration.

create or replace function private.prevent_appointment_calendar_block_conflict()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'cancelled'::public.appointment_status and exists (
    select 1
    from public.calendar_blocks block
    where block.business_id = new.business_id
      and block.block_date = new.appointment_date
      and block.cancelled_at is null
      and block.resource_id = coalesce(new.group_1_option_id, new.business_id)
      and block.start_time < new.end_time
      and block.end_time > new.start_time
  ) then
    raise exception 'booking_conflict' using errcode = '23P01';
  end if;
  return new;
end;
$$;

create trigger appointments_reject_calendar_block_conflict
before insert or update of business_id, group_1_option_id, appointment_date,
  start_time, end_time, status
on public.appointments
for each row execute function private.prevent_appointment_calendar_block_conflict();

revoke all on function private.prevent_appointment_calendar_block_conflict() from public;

comment on function private.prevent_appointment_calendar_block_conflict() is
  'Database boundary invariant: no active appointment may overlap an active administrative block for the same Group 1 resource (or business-wide resource when Group 1 is absent).';
