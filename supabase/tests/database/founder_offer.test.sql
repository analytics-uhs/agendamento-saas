begin;

create extension if not exists pgtap with schema extensions;
select plan(12);

-- Linked-safe: compare against a snapshot, never delete customer claims.
create temp table founder_test_baseline as
select count(*)::integer as claims from private.founder_offer_claims;
grant select on founder_test_baseline to anon, authenticated;
create function pg_temp.expected_founder_offer(extra integer) returns jsonb
language sql as $$
  select jsonb_build_object('totalSpots',50,'occupiedSpots',occupied,
    'availableSpots',50-occupied,'occupiedPercentage',occupied*2)
  from (select least(50,38+claims+extra) occupied from founder_test_baseline) counts;
$$;

select has_function(
  'public',
  'get_public_founder_offer',
  array[]::text[],
  'the landing reads the offer through a dedicated aggregate RPC'
);

select ok(
  has_function_privilege('anon', 'public.get_public_founder_offer()', 'EXECUTE'),
  'anonymous visitors can execute only the aggregate offer RPC'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select results_eq(
  $$select public.get_public_founder_offer()$$,
  $$select pg_temp.expected_founder_offer(0)$$,
  'the public snapshot starts at the commercial baseline'
);

select results_eq(
  $$select array_agg(key order by key)
    from jsonb_object_keys(public.get_public_founder_offer()) as keys(key)$$,
  $$values (array['availableSpots','occupiedPercentage','occupiedSpots','totalSpots']::text[])$$,
  'the public surface exposes only the four required aggregates'
);

reset role;

insert into auth.users (id, email)
values ('90000000-0000-4000-8000-000000000001', 'founder-no-business@example.test');

select results_eq(
  $$select public.get_public_founder_offer()$$,
  $$select pg_temp.expected_founder_offer(0)$$,
  'an authenticated user without a business does not consume a spot'
);

insert into public.businesses (id, name, slug, created_at)
select
  '91000000-0000-4000-8000-000000000001',
  'Before Launch',
  'before-launch',
  launch_at - interval '1 second'
from private.founder_offer_config
where offer_key = 'founders_2026';

select is(
  private.claim_founder_offer('91000000-0000-4000-8000-000000000001'),
  false,
  'a business created before the persisted launch marker is not counted'
);

insert into public.businesses (id, name, slug, created_at)
select
  '91000000-0000-4000-8000-000000000002',
  'After Launch',
  'after-launch',
  launch_at + interval '1 second'
from private.founder_offer_config
where offer_key = 'founders_2026';

select is(
  private.claim_founder_offer('91000000-0000-4000-8000-000000000002'),
  true,
  'an eligible completed business consumes one immutable spot'
);

select results_eq(
  $$select public.get_public_founder_offer()$$,
  $$select pg_temp.expected_founder_offer(1)$$,
  'one eligible business adds one occupied spot up to the cap'
);

insert into private.founder_offer_claims (business_id)
select gen_random_uuid() from generate_series(1, 4);

select results_eq(
  $$select public.get_public_founder_offer()$$,
  $$select pg_temp.expected_founder_offer(5)$$,
  'five eligible businesses add five occupied spots up to the cap'
);

insert into private.founder_offer_claims (business_id)
select gen_random_uuid() from generate_series(1, 7);

select results_eq(
  $$select public.get_public_founder_offer()$$,
  $$values ('{"totalSpots":50,"occupiedSpots":50,"availableSpots":0,"occupiedPercentage":100}'::jsonb)$$,
  'twelve eligible businesses exhaust the founder offer'
);

insert into private.founder_offer_claims (business_id)
select gen_random_uuid() from generate_series(1, 8);

select results_eq(
  $$select public.get_public_founder_offer()$$,
  $$values ('{"totalSpots":50,"occupiedSpots":50,"availableSpots":0,"occupiedPercentage":100}'::jsonb)$$,
  'additional businesses never produce negative availability or more than 100 percent'
);

select is(
  private.claim_founder_offer('91000000-0000-4000-8000-000000000002'),
  false,
  'claiming the same business again is idempotent'
);

select * from finish();
rollback;
