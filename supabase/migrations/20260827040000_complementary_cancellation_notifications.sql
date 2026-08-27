-- Administrative cancellation for reservation aggregates and notifications for public complementary-only reservations.

alter table public.admin_notifications
  add column reservation_resource_id uuid
    references public.reservation_resources (id) on delete set null;

create unique index admin_notifications_resource_user_type_unique
  on public.admin_notifications (reservation_resource_id, user_id, type)
  where reservation_resource_id is not null;

create or replace function private.create_public_complementary_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_reservation public.reservations%rowtype;
  date_description text;
  local_today date := (pg_catalog.now() at time zone 'America/Sao_Paulo')::date;
  weekday_name text;
  weekday_preposition text;
  notification_message text;
begin
  select reservation.* into selected_reservation
  from public.reservations as reservation
  where reservation.id = new.reservation_id
    and reservation.business_id = new.business_id;

  if not found
    or selected_reservation.source <> 'public'::public.appointment_source
    or exists (
      select 1 from public.appointments as appointment
      where appointment.reservation_id = new.reservation_id
        and appointment.business_id = new.business_id
    )
  then
    return new;
  end if;

  if new.reservation_date = local_today then
    date_description := 'hoje';
  elsif new.reservation_date = local_today + 1 then
    date_description := 'amanhã';
  else
    weekday_name := case extract(dow from new.reservation_date)::integer
      when 0 then 'domingo' when 1 then 'segunda-feira' when 2 then 'terça-feira'
      when 3 then 'quarta-feira' when 4 then 'quinta-feira' when 5 then 'sexta-feira'
      else 'sábado' end;
    weekday_preposition := case extract(dow from new.reservation_date)::integer
      when 0 then 'no' when 6 then 'no' else 'na' end;
    date_description := format('%s %s, dia %s', weekday_preposition, weekday_name, to_char(new.reservation_date, 'DD/MM'));
  end if;

  notification_message := case new.occupancy_mode
    when 'day'::public.booking_group_occupancy_mode then
      format('%s reservou %s para %s · Reserva do dia.', selected_reservation.customer_name, new.option_name_snapshot, date_description)
    else
      format('%s reservou %s para %s · %s–%s.', selected_reservation.customer_name, new.option_name_snapshot, date_description, to_char(new.start_time, 'HH24:MI'), to_char(new.end_time, 'HH24:MI'))
  end;

  insert into public.admin_notifications (
    business_id, user_id, type, title, message, appointment_id, reservation_resource_id
  )
  select new.business_id, membership.user_id, 'new_public_appointment', 'Nova reserva',
    notification_message, null, new.id
  from public.business_members as membership
  where membership.business_id = new.business_id
    and membership.role in ('owner', 'admin')
  on conflict (reservation_resource_id, user_id, type) where reservation_resource_id is not null
  do nothing;

  return new;
end;
$$;

create trigger reservation_resources_create_admin_notifications
after insert on public.reservation_resources
for each row execute function private.create_public_complementary_notification();

create or replace function public.cancel_admin_reservation_resource(p_resource_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare selected_resource public.reservation_resources%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  select resource.* into selected_resource from public.reservation_resources resource
  where resource.id = p_resource_id
    and private.has_business_role(resource.business_id, array['owner','admin']::public.business_role[])
  for update;
  if not found then raise exception 'reservation_resource_not_found' using errcode = '42501'; end if;
  if selected_resource.status <> 'cancelled'::public.appointment_status then
    update public.reservation_resources set status = 'cancelled' where id = selected_resource.id;
  end if;
  return jsonb_build_object('reservation_id', selected_resource.reservation_id, 'resource_id', selected_resource.id, 'status', 'cancelled');
end;
$$;

create or replace function public.cancel_admin_reservation(p_reservation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare selected_reservation public.reservations%rowtype; appointment_count integer; resource_count integer;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  select reservation.* into selected_reservation from public.reservations reservation
  where reservation.id = p_reservation_id
    and private.has_business_role(reservation.business_id, array['owner','admin']::public.business_role[])
  for update;
  if not found then raise exception 'reservation_not_found' using errcode = '42501'; end if;

  update public.appointments set status = 'cancelled'
  where reservation_id = selected_reservation.id and business_id = selected_reservation.business_id
    and status <> 'cancelled';
  get diagnostics appointment_count = row_count;

  update public.reservation_resources set status = 'cancelled'
  where reservation_id = selected_reservation.id and business_id = selected_reservation.business_id
    and status <> 'cancelled';
  get diagnostics resource_count = row_count;

  return jsonb_build_object('reservation_id', selected_reservation.id, 'status', 'cancelled', 'appointments_cancelled', appointment_count, 'resources_cancelled', resource_count);
end;
$$;

revoke all on function private.create_public_complementary_notification() from public, anon, authenticated;
revoke all on function public.cancel_admin_reservation_resource(uuid) from public, anon;
revoke all on function public.cancel_admin_reservation(uuid) from public, anon;
grant execute on function public.cancel_admin_reservation_resource(uuid) to authenticated;
grant execute on function public.cancel_admin_reservation(uuid) to authenticated;

comment on function public.cancel_admin_reservation_resource(uuid) is
'Cancels only one complementary component and releases its allocation through the existing synchronization trigger.';
comment on function public.cancel_admin_reservation(uuid) is
'Atomically cancels every active appointment and complementary component of one authorized reservation aggregate.';
