-- Internal admin notifications and browser push subscriptions for public bookings.

create table public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type = 'new_public_appointment'),
  title text not null check (char_length(title) between 1 and 120),
  message text not null check (char_length(message) between 1 and 500),
  appointment_id uuid references public.appointments (id) on delete set null,
  read_at timestamptz,
  push_dispatched_at timestamptz,
  created_at timestamptz not null default now(),
  constraint admin_notifications_appointment_user_type_unique
    unique (appointment_id, user_id, type)
);

create index admin_notifications_user_recent_idx
  on public.admin_notifications (user_id, business_id, created_at desc);
create index admin_notifications_user_unread_idx
  on public.admin_notifications (user_id, business_id, created_at desc)
  where read_at is null;
create index admin_notifications_pending_push_idx
  on public.admin_notifications (business_id, created_at)
  where push_dispatched_at is null;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) between 12 and 2048),
  p256dh text not null check (char_length(p256dh) between 16 and 512),
  auth text not null check (char_length(auth) between 8 and 512),
  user_agent text check (user_agent is null or char_length(user_agent) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_subscriptions_business_user_idx
  on public.push_subscriptions (business_id, user_id);

create trigger push_subscriptions_set_updated_at
before update on public.push_subscriptions
for each row execute function private.set_updated_at();

alter table public.admin_notifications enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.admin_notifications replica identity full;

revoke all on table public.admin_notifications from public, anon, authenticated;
revoke all on table public.push_subscriptions from public, anon, authenticated;
grant select on table public.admin_notifications to authenticated;
grant select on table public.push_subscriptions to authenticated;

create policy admin_notifications_select_recipient
on public.admin_notifications
for select
to authenticated
using (
  user_id = (select auth.uid())
  and (select private.has_business_role(
    business_id,
    array['owner', 'admin']::public.business_role[]
  ))
);

create policy push_subscriptions_select_own
on public.push_subscriptions
for select
to authenticated
using (
  user_id = (select auth.uid())
  and (select private.has_business_role(
    business_id,
    array['owner', 'admin']::public.business_role[]
  ))
);

create policy push_subscriptions_insert_own
on public.push_subscriptions
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and (select private.has_business_role(
    business_id,
    array['owner', 'admin']::public.business_role[]
  ))
);

create policy push_subscriptions_delete_own
on public.push_subscriptions
for delete
to authenticated
using (
  user_id = (select auth.uid())
  and (select private.has_business_role(
    business_id,
    array['owner', 'admin']::public.business_role[]
  ))
);

create or replace function private.create_public_booking_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  group_1_name text;
  group_2_name text;
  selected_names text;
  date_description text;
  notification_message text;
  local_today date := (pg_catalog.now() at time zone 'America/Sao_Paulo')::date;
  weekday_name text;
  weekday_preposition text;
begin
  if new.source <> 'public'::public.appointment_source then
    return new;
  end if;

  if new.group_1_option_id is not null then
    select booking_option.name into group_1_name
    from public.booking_options as booking_option
    where booking_option.id = new.group_1_option_id
      and booking_option.business_id = new.business_id;
  end if;

  if new.group_2_option_id is not null then
    select booking_option.name into group_2_name
    from public.booking_options as booking_option
    where booking_option.id = new.group_2_option_id
      and booking_option.business_id = new.business_id;
  end if;

  selected_names := concat_ws(' · ', group_1_name, group_2_name);

  if new.appointment_date = local_today then
    date_description := format('hoje às %s', to_char(new.start_time, 'HH24:MI'));
  elsif new.appointment_date = local_today + 1 then
    date_description := format('amanhã às %s', to_char(new.start_time, 'HH24:MI'));
  else
    weekday_name := case extract(dow from new.appointment_date)::integer
      when 0 then 'domingo'
      when 1 then 'segunda-feira'
      when 2 then 'terça-feira'
      when 3 then 'quarta-feira'
      when 4 then 'quinta-feira'
      when 5 then 'sexta-feira'
      else 'sábado'
    end;
    weekday_preposition := case extract(dow from new.appointment_date)::integer
      when 0 then 'no'
      when 6 then 'no'
      else 'na'
    end;
    date_description := format(
      '%s %s, dia %s, às %s',
      weekday_preposition,
      weekday_name,
      to_char(new.appointment_date, 'DD/MM'),
      to_char(new.start_time, 'HH24:MI')
    );
  end if;

  notification_message := case
    when selected_names = '' then format(
      '%s fez um novo agendamento para %s.',
      new.customer_name,
      date_description
    )
    else format(
      '%s agendou %s para %s.',
      new.customer_name,
      selected_names,
      date_description
    )
  end;

  insert into public.admin_notifications (
    business_id,
    user_id,
    type,
    title,
    message,
    appointment_id
  )
  select
    new.business_id,
    membership.user_id,
    'new_public_appointment',
    'Novo agendamento',
    notification_message,
    new.id
  from public.business_members as membership
  where membership.business_id = new.business_id
    and membership.role in ('owner', 'admin')
  on conflict (appointment_id, user_id, type) do nothing;

  return new;
end;
$$;

create trigger appointments_create_admin_notifications
after insert on public.appointments
for each row
when (new.source = 'public'::public.appointment_source)
execute function private.create_public_booking_notifications();

create or replace function public.mark_admin_notification_read(p_notification_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  marked_at timestamptz;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  update public.admin_notifications as notification
  set read_at = coalesce(notification.read_at, pg_catalog.now())
  where notification.id = p_notification_id
    and notification.user_id = current_user_id
    and (select private.has_business_role(
      notification.business_id,
      array['owner', 'admin']::public.business_role[]
    ))
  returning notification.read_at into marked_at;

  if not found then
    raise exception 'admin_notification_not_found' using errcode = '42501';
  end if;

  return marked_at;
end;
$$;

create or replace function public.mark_all_admin_notifications_read(p_business_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  affected integer;
begin
  if current_user_id is null
    or not (select private.has_business_role(
      p_business_id,
      array['owner', 'admin']::public.business_role[]
    )) then
    raise exception 'admin_notification_forbidden' using errcode = '42501';
  end if;

  update public.admin_notifications
  set read_at = pg_catalog.now()
  where business_id = p_business_id
    and user_id = current_user_id
    and read_at is null;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function public.save_push_subscription(
  p_business_id uuid,
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  existing_subscription public.push_subscriptions%rowtype;
  subscription_id uuid;
begin
  if current_user_id is null
    or not (select private.has_business_role(
      p_business_id,
      array['owner', 'admin']::public.business_role[]
    )) then
    raise exception 'push_subscription_forbidden' using errcode = '42501';
  end if;

  if p_endpoint !~ '^https://'
    or char_length(p_endpoint) not between 12 and 2048
    or char_length(p_p256dh) not between 16 and 512
    or char_length(p_auth) not between 8 and 512
    or (p_user_agent is not null and char_length(p_user_agent) > 500) then
    raise exception 'push_subscription_invalid' using errcode = '22023';
  end if;

  select subscription.* into existing_subscription
  from public.push_subscriptions as subscription
  where subscription.endpoint = p_endpoint
  for update;

  if found and (
    existing_subscription.user_id <> current_user_id
    or existing_subscription.business_id <> p_business_id
  ) then
    raise exception 'push_subscription_endpoint_in_use' using errcode = '42501';
  end if;

  insert into public.push_subscriptions (
    user_id,
    business_id,
    endpoint,
    p256dh,
    auth,
    user_agent
  ) values (
    current_user_id,
    p_business_id,
    p_endpoint,
    p_p256dh,
    p_auth,
    nullif(trim(p_user_agent), '')
  )
  on conflict (endpoint) do update set
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    user_agent = excluded.user_agent,
    updated_at = pg_catalog.now()
  returning id into subscription_id;

  return subscription_id;
end;
$$;

create or replace function public.remove_push_subscription(p_endpoint text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  delete from public.push_subscriptions as subscription
  where subscription.endpoint = p_endpoint
    and subscription.user_id = current_user_id
    and (select private.has_business_role(
      subscription.business_id,
      array['owner', 'admin']::public.business_role[]
    ));

  return found;
end;
$$;

create or replace function public.claim_pending_admin_push_notifications(p_business_slug text)
returns table (
  notification_id uuid,
  business_id uuid,
  user_id uuid,
  title text,
  message text,
  appointment_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'push_dispatch_forbidden' using errcode = '42501';
  end if;

  return query
  update public.admin_notifications as notification
  set push_dispatched_at = pg_catalog.now()
  from public.businesses as business
  where business.id = notification.business_id
    and business.slug = lower(trim(p_business_slug))
    and notification.push_dispatched_at is null
  returning
    notification.id,
    notification.business_id,
    notification.user_id,
    notification.title,
    notification.message,
    notification.appointment_id;
end;
$$;

revoke all on function private.create_public_booking_notifications() from public, anon, authenticated;
revoke all on function public.mark_admin_notification_read(uuid) from public;
revoke all on function public.mark_all_admin_notifications_read(uuid) from public;
revoke all on function public.save_push_subscription(uuid, text, text, text, text) from public;
revoke all on function public.remove_push_subscription(text) from public;
revoke all on function public.claim_pending_admin_push_notifications(text) from public;

grant execute on function public.mark_admin_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_admin_notifications_read(uuid) to authenticated;
grant execute on function public.save_push_subscription(uuid, text, text, text, text) to authenticated;
grant execute on function public.remove_push_subscription(text) to authenticated;
grant execute on function public.claim_pending_admin_push_notifications(text) to service_role;

alter publication supabase_realtime add table public.admin_notifications;

comment on table public.admin_notifications is
  'Per-recipient history of internal administrative events. Public bookings create one row for each current owner/admin.';
comment on table public.push_subscriptions is
  'Browser Push API subscriptions owned by one authenticated owner/admin and isolated by business.';
comment on function public.claim_pending_admin_push_notifications(text) is
  'Service-role-only queue claim used by the Next.js server after a public appointment commits; push delivery never participates in the booking transaction.';
