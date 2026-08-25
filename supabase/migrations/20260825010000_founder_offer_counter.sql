-- Persistent founder-offer counter.
-- The launch marker is deliberately fixed: businesses completed before it are
-- already represented by the commercial baseline and are never backfilled.

create table private.founder_offer_config (
  offer_key text primary key,
  total_spots integer not null check (total_spots > 0),
  baseline_occupied_spots integer not null check (
    baseline_occupied_spots between 0 and total_spots
  ),
  launch_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint founder_offer_config_key_check check (offer_key = 'founders_2026')
);

insert into private.founder_offer_config (
  offer_key,
  total_spots,
  baseline_occupied_spots,
  launch_at
)
values (
  'founders_2026',
  50,
  38,
  '2026-08-25 16:45:00-03'::timestamptz
);

create table private.founder_offer_claims (
  business_id uuid primary key,
  claimed_at timestamptz not null default now()
);

revoke all on table private.founder_offer_config from public, anon, authenticated;
revoke all on table private.founder_offer_claims from public, anon, authenticated;

comment on table private.founder_offer_config is
  'Single persisted source for the 2026 founder offer capacity, baseline and deterministic launch marker.';
comment on table private.founder_offer_claims is
  'Immutable commercial claims created only after successful onboarding. The business UUID intentionally has no cascading foreign key so a claimed spot is never released.';

create or replace function private.claim_founder_offer(p_business_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_rows integer;
begin
  insert into private.founder_offer_claims (business_id)
  select business.id
  from public.businesses as business
  join private.founder_offer_config as offer
    on offer.offer_key = 'founders_2026'
  where business.id = p_business_id
    and business.created_at >= offer.launch_at
  on conflict (business_id) do nothing;

  get diagnostics inserted_rows = row_count;
  return inserted_rows = 1;
end;
$$;

revoke all on function private.claim_founder_offer(uuid) from public, anon, authenticated;

alter function public.complete_business_onboarding(jsonb)
rename to complete_business_onboarding_before_founder_offer;

revoke all on function public.complete_business_onboarding_before_founder_offer(jsonb)
from public, anon, authenticated;

create or replace function public.complete_business_onboarding(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_business_id uuid;
begin
  new_business_id := public.complete_business_onboarding_before_founder_offer(p_payload);
  perform private.claim_founder_offer(new_business_id);
  return new_business_id;
end;
$$;

revoke all on function public.complete_business_onboarding(jsonb) from public, anon;
grant execute on function public.complete_business_onboarding(jsonb) to authenticated;

comment on function public.complete_business_onboarding(jsonb) is
  'Completes onboarding atomically and records one immutable founder-offer claim for eligible businesses created after the persisted launch marker.';

create or replace function public.get_public_founder_offer()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with offer as (
    select
      config.total_spots,
      least(
        config.total_spots,
        config.baseline_occupied_spots + count(claim.business_id)::integer
      ) as occupied_spots
    from private.founder_offer_config as config
    left join private.founder_offer_claims as claim on true
    where config.offer_key = 'founders_2026'
    group by config.total_spots, config.baseline_occupied_spots
  )
  select jsonb_build_object(
    'totalSpots', offer.total_spots,
    'occupiedSpots', offer.occupied_spots,
    'availableSpots', greatest(offer.total_spots - offer.occupied_spots, 0),
    'occupiedPercentage', case
      when offer.total_spots = 0 then 0
      else round((offer.occupied_spots::numeric / offer.total_spots::numeric) * 100)::integer
    end
  )
  from offer;
$$;

revoke all on function public.get_public_founder_offer() from public, authenticated;
grant execute on function public.get_public_founder_offer() to anon;

comment on function public.get_public_founder_offer() is
  'Public aggregate-only founder offer snapshot. It exposes no business, user, identifier or individual timestamp.';
