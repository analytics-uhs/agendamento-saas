-- Administrative appointment management built on the public booking engine.

create type public.appointment_source as enum ('public', 'admin');

alter table public.appointments
add column source public.appointment_source not null default 'public';

comment on column public.appointments.source is
  'Origin of the appointment. Public bookings are anonymous; admin bookings are attributed to auth.uid().';

create or replace function private.set_appointment_origin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if pg_catalog.current_setting('app.appointment_source', true) = 'admin' then
    if (select auth.uid()) is null
      or not (select private.has_business_role(
        new.business_id,
        array['owner', 'admin']::public.business_role[]
      )) then
      raise exception 'admin_appointment_forbidden' using errcode = '42501';
    end if;

    new.source := 'admin';
    new.created_by := (select auth.uid());
  else
    new.source := 'public';
    new.created_by := null;
  end if;

  return new;
end;
$$;

create trigger appointments_set_origin
before insert on public.appointments
for each row execute function private.set_appointment_origin();

create or replace function private.preserve_appointment_ownership()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.business_id <> old.business_id then
    raise exception 'appointment business_id cannot be changed';
  end if;

  if new.created_by is distinct from old.created_by then
    raise exception 'appointment created_by cannot be changed';
  end if;

  if new.source is distinct from old.source then
    raise exception 'appointment source cannot be changed';
  end if;

  return new;
end;
$$;

drop trigger appointments_preserve_ownership on public.appointments;
create trigger appointments_preserve_ownership
before update of business_id, created_by, source on public.appointments
for each row execute function private.preserve_appointment_ownership();

create or replace function private.validate_appointment_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
    and (
      old.status <> 'scheduled'::public.appointment_status
      or new.status not in (
        'completed'::public.appointment_status,
        'cancelled'::public.appointment_status,
        'no_show'::public.appointment_status
      )
    ) then
    raise exception 'appointment_invalid_status_transition' using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger appointments_validate_status_transition
before update of status on public.appointments
for each row execute function private.validate_appointment_status_transition();

create or replace function public.create_admin_appointment(
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
  current_user_id uuid := (select auth.uid());
  selected_business record;
  result jsonb;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select business.id, business.slug
  into selected_business
  from public.business_members as membership
  join public.businesses as business on business.id = membership.business_id
  where membership.user_id = current_user_id
    and membership.role in ('owner', 'admin')
  order by membership.created_at, membership.id
  limit 1;

  if not found then
    raise exception 'admin_appointment_forbidden' using errcode = '42501';
  end if;

  perform pg_catalog.set_config('app.appointment_source', 'admin', true);

  result := public.create_public_appointment(
    selected_business.slug,
    p_group_1_option_id,
    p_group_2_option_id,
    p_date,
    p_start_time,
    p_blocks,
    p_customer_name,
    p_customer_whatsapp
  );

  return result;
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
  current_status public.appointment_status;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if p_status not in (
    'completed'::public.appointment_status,
    'cancelled'::public.appointment_status,
    'no_show'::public.appointment_status
  ) then
    raise exception 'appointment_invalid_target_status' using errcode = '22023';
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
    raise exception 'appointment_invalid_status_transition' using errcode = '22023';
  end if;

  update public.appointments
  set status = p_status
  where id = p_appointment_id;

  return true;
end;
$$;

revoke insert on table public.appointments from authenticated;

revoke all on function public.create_admin_appointment(uuid, uuid, date, time, integer, text, text) from public;
grant execute on function public.create_admin_appointment(uuid, uuid, date, time, integer, text, text) to authenticated;

revoke all on function public.set_appointment_status(uuid, public.appointment_status) from public;
grant execute on function public.set_appointment_status(uuid, public.appointment_status) to authenticated;

comment on function public.create_admin_appointment(uuid, uuid, date, time, integer, text, text) is
  'Creates an attributed admin appointment by delegating validation, availability, duration, and concurrency to create_public_appointment.';
comment on function public.set_appointment_status(uuid, public.appointment_status) is
  'Allows an owner/admin to move a scheduled appointment to completed, cancelled, or no_show within their current membership.';
