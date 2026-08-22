-- Reliable, expiring claims and per-device delivery tracking for admin Web Push.

alter table public.admin_notifications
add column push_claimed_at timestamptz,
add column push_claim_token uuid,
add column push_delivery_status text
  check (push_delivery_status is null or push_delivery_status in ('delivered', 'no_subscriptions'));

-- The previous implementation wrote this timestamp before attempting delivery.
-- Reset those ambiguous marks so every row follows the reliable protocol below.
update public.admin_notifications
set push_dispatched_at = null
where push_dispatched_at is not null;

drop index if exists public.admin_notifications_pending_push_idx;
create index admin_notifications_pending_push_idx
  on public.admin_notifications (business_id, created_at)
  where push_dispatched_at is null;
create index admin_notifications_expired_claim_idx
  on public.admin_notifications (push_claimed_at)
  where push_dispatched_at is null and push_claimed_at is not null;

create table public.admin_notification_push_deliveries (
  notification_id uuid not null
    references public.admin_notifications (id) on delete cascade,
  subscription_id uuid not null
    references public.push_subscriptions (id) on delete cascade,
  delivered_at timestamptz not null default now(),
  primary key (notification_id, subscription_id)
);

alter table public.admin_notification_push_deliveries enable row level security;
revoke all on table public.admin_notification_push_deliveries from public, anon, authenticated;
grant select on table public.admin_notification_push_deliveries to service_role;

drop function public.claim_pending_admin_push_notifications(text);

create function public.claim_pending_admin_push_notifications(
  p_business_slug text,
  p_limit integer default 100
)
returns table (
  notification_id uuid,
  business_id uuid,
  user_id uuid,
  title text,
  message text,
  appointment_id uuid,
  claim_token uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_claim_token uuid := gen_random_uuid();
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'push_dispatch_forbidden' using errcode = '42501';
  end if;
  if p_limit is null or p_limit not between 1 and 500 then
    raise exception 'push_claim_invalid_limit' using errcode = '22023';
  end if;

  return query
  with claimable as (
    select notification.id
    from public.admin_notifications as notification
    join public.businesses as business on business.id = notification.business_id
    where business.slug = lower(trim(p_business_slug))
      and notification.push_dispatched_at is null
      and (
        notification.push_claimed_at is null
        or notification.push_claimed_at < pg_catalog.now() - interval '5 minutes'
      )
    order by notification.created_at, notification.id
    for update of notification skip locked
    limit p_limit
  )
  update public.admin_notifications as notification
  set
    push_claimed_at = pg_catalog.now(),
    push_claim_token = new_claim_token
  from claimable
  where notification.id = claimable.id
  returning
    notification.id,
    notification.business_id,
    notification.user_id,
    notification.title,
    notification.message,
    notification.appointment_id,
    notification.push_claim_token;
end;
$$;

create function public.record_admin_push_delivery(
  p_notification_id uuid,
  p_subscription_id uuid,
  p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'push_dispatch_forbidden' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.admin_notifications as notification
    join public.push_subscriptions as subscription
      on subscription.business_id = notification.business_id
     and subscription.user_id = notification.user_id
    where notification.id = p_notification_id
      and notification.push_dispatched_at is null
      and notification.push_claim_token = p_claim_token
      and subscription.id = p_subscription_id
  ) then
    raise exception 'push_delivery_claim_invalid' using errcode = '42501';
  end if;

  insert into public.admin_notification_push_deliveries (
    notification_id,
    subscription_id
  ) values (
    p_notification_id,
    p_subscription_id
  )
  on conflict (notification_id, subscription_id) do nothing;

  return true;
end;
$$;

create function public.complete_admin_push_notification(
  p_notification_id uuid,
  p_claim_token uuid,
  p_outcome text
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  completed_at timestamptz;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'push_dispatch_forbidden' using errcode = '42501';
  end if;
  if p_outcome not in ('delivered', 'no_subscriptions') then
    raise exception 'push_delivery_invalid_outcome' using errcode = '22023';
  end if;

  if p_outcome = 'delivered' and exists (
    select 1
    from public.admin_notifications as notification
    join public.push_subscriptions as subscription
      on subscription.business_id = notification.business_id
     and subscription.user_id = notification.user_id
    where notification.id = p_notification_id
      and notification.push_claim_token = p_claim_token
      and not exists (
        select 1
        from public.admin_notification_push_deliveries as delivery
        where delivery.notification_id = notification.id
          and delivery.subscription_id = subscription.id
      )
  ) then
    raise exception 'push_delivery_incomplete' using errcode = '55000';
  end if;

  if p_outcome = 'no_subscriptions' and exists (
    select 1
    from public.admin_notifications as notification
    join public.push_subscriptions as subscription
      on subscription.business_id = notification.business_id
     and subscription.user_id = notification.user_id
    where notification.id = p_notification_id
      and notification.push_claim_token = p_claim_token
  ) then
    raise exception 'push_delivery_has_subscriptions' using errcode = '55000';
  end if;

  update public.admin_notifications
  set
    push_dispatched_at = pg_catalog.now(),
    push_delivery_status = p_outcome,
    push_claimed_at = null,
    push_claim_token = null
  where id = p_notification_id
    and push_dispatched_at is null
    and push_claim_token = p_claim_token
  returning push_dispatched_at into completed_at;

  if not found then
    raise exception 'push_delivery_claim_invalid' using errcode = '42501';
  end if;

  return completed_at;
end;
$$;

create function public.release_admin_push_notification(
  p_notification_id uuid,
  p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'push_dispatch_forbidden' using errcode = '42501';
  end if;

  update public.admin_notifications
  set
    push_claimed_at = null,
    push_claim_token = null
  where id = p_notification_id
    and push_dispatched_at is null
    and push_claim_token = p_claim_token;

  return found;
end;
$$;

revoke all on function public.claim_pending_admin_push_notifications(text, integer) from public;
revoke all on function public.record_admin_push_delivery(uuid, uuid, uuid) from public;
revoke all on function public.complete_admin_push_notification(uuid, uuid, text) from public;
revoke all on function public.release_admin_push_notification(uuid, uuid) from public;

grant execute on function public.claim_pending_admin_push_notifications(text, integer) to service_role;
grant execute on function public.record_admin_push_delivery(uuid, uuid, uuid) to service_role;
grant execute on function public.complete_admin_push_notification(uuid, uuid, text) to service_role;
grant execute on function public.release_admin_push_notification(uuid, uuid) to service_role;

comment on column public.admin_notifications.push_dispatched_at is
  'Set only after all currently valid recipient subscriptions complete, or when the recipient has no active subscription.';
comment on column public.admin_notifications.push_claimed_at is
  'Temporary five-minute lease timestamp. Expired claims are eligible for another worker.';
comment on table public.admin_notification_push_deliveries is
  'Per-device success ledger. Retries skip subscriptions that already received the notification.';
comment on function public.claim_pending_admin_push_notifications(text, integer) is
  'Service-role-only SKIP LOCKED lease. It never marks delivery success.';
comment on function public.release_admin_push_notification(uuid, uuid) is
  'Releases a matching service-role lease after a transient failure so the notification can be retried.';
