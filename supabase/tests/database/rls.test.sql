begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('20000000-0000-4000-8000-000000000001', 'owner-a@example.test', '{"name":"Owner A"}'),
  ('20000000-0000-4000-8000-000000000002', 'owner-b@example.test', '{"name":"Owner B"}'),
  ('20000000-0000-4000-8000-000000000003', 'platform@example.test', '{"name":"Platform"}');

insert into public.businesses (id, name, slug)
values
  ('21000000-0000-4000-8000-000000000001', 'Business A', 'business-a'),
  ('21000000-0000-4000-8000-000000000002', 'Business B', 'business-b');

insert into public.business_members (business_id, user_id, role)
values
  ('21000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'owner'),
  ('21000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'owner');

insert into private.platform_admins (user_id)
values ('20000000-0000-4000-8000-000000000003');

insert into public.business_settings (business_id)
values
  ('21000000-0000-4000-8000-000000000001'),
  ('21000000-0000-4000-8000-000000000002');

select policies_are(
  'public',
  'profiles',
  array['profiles_insert_own', 'profiles_select_own', 'profiles_update_own'],
  'profiles has only self-service policies'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select results_eq(
  'select count(*)::bigint from public.profiles',
  array[1::bigint],
  'a user sees only their profile'
);

select results_eq(
  'select name from public.businesses order by name',
  array['Business A'::text],
  'a member sees only their business'
);

select results_eq(
  $$select count(*)::bigint from public.business_members
    where business_id = '21000000-0000-4000-8000-000000000002'$$,
  array[0::bigint],
  'cross-tenant memberships are hidden'
);

select lives_ok(
  $$update public.businesses set name = 'Intrusion'
    where id = '21000000-0000-4000-8000-000000000002'$$,
  'a cross-tenant update affects no visible row'
);

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated"}', true);

select results_eq(
  'select count(*)::bigint from public.businesses',
  array[2::bigint],
  'a platform admin sees all businesses through the private allow-list'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  'select * from public.businesses',
  '42501',
  null,
  'anonymous users cannot query administrative tables'
);

select results_eq(
  $$select public.get_public_booking_page('business-a') is not null$$,
  array[true],
  'anonymous users can call the curated booking RPC'
);

select * from finish();
rollback;
