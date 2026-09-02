begin;

create extension if not exists pgtap with schema extensions;
select plan(28);

-- Compare deltas: linked environments need not be empty. No customer rows are changed.
create temporary table platform_baseline as select
  (select count(*)::integer from public.businesses) businesses,
  (select count(*)::integer from public.appointments where appointment_date > (now() at time zone 'America/Sao_Paulo')::date and status='scheduled') future_appointments;
grant select on platform_baseline to authenticated;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('60000000-0000-4000-8000-000000000001', 'alpha-owner@example.test', '{"name":"Alpha Owner"}'),
  ('60000000-0000-4000-8000-000000000002', 'beta-owner@example.test', '{"name":"Beta Owner"}'),
  ('60000000-0000-4000-8000-000000000003', 'platform-admin@example.test', '{"name":"Platform Admin"}');

insert into public.businesses (id, name, slug, active)
values
  ('61000000-0000-4000-8000-000000000001', 'Alpha Club', 'alpha-club', true),
  ('61000000-0000-4000-8000-000000000002', 'Beta Studio', 'beta-studio', false);

insert into public.business_members (business_id, user_id, role)
values
  ('61000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'owner'),
  ('61000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000002', 'owner');

insert into private.platform_admins (user_id, created_by)
values ('60000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000003');

insert into public.business_settings (business_id, duration_mode, fixed_duration_minutes)
values
  ('61000000-0000-4000-8000-000000000001', 'fixed', 30),
  ('61000000-0000-4000-8000-000000000002', 'fixed', 30);

insert into public.business_hours (business_id, weekday, active, start_time, end_time)
select business_id, weekday, true, '09:00', '12:00'
from (values
  ('61000000-0000-4000-8000-000000000001'::uuid),
  ('61000000-0000-4000-8000-000000000002'::uuid)
) as businesses(business_id)
cross join generate_series(0, 6) as weekdays(weekday);

select has_function('public', 'is_current_user_platform_admin', array[]::text[], 'platform access has a dedicated RPC');
select has_function('public', 'get_platform_metrics', array[]::text[], 'platform metrics have a dedicated RPC');
select has_function('public', 'list_platform_businesses', array['text', 'boolean', 'integer', 'integer'], 'business listing has a dedicated RPC');
select has_function('public', 'get_platform_business_detail', array['uuid'], 'business detail has a dedicated RPC');
select has_function('public', 'set_platform_business_active', array['uuid', 'boolean'], 'activation has a dedicated RPC');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select results_eq(
  'select public.is_current_user_platform_admin()',
  array[false],
  'a regular user is not recognized as a platform admin'
);

select throws_ok(
  $$select public.list_platform_businesses(null, null, 1, 20)$$,
  '42501', null,
  'a regular user cannot call the platform business listing'
);

select results_eq(
  'select name from public.businesses order by name',
  array['Alpha Club'::text],
  'regular tenant isolation remains unchanged'
);

select throws_ok(
  $$update public.businesses set active = false
    where id = '61000000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'a business owner cannot change activation directly'
);

select throws_ok(
  $$select public.set_platform_business_active(
    '61000000-0000-4000-8000-000000000001', false
  )$$,
  '42501', null,
  'a regular user cannot call the activation RPC'
);

select set_config('request.jwt.claims', '{"sub":"60000000-0000-4000-8000-000000000003","role":"authenticated"}', true);

select results_eq(
  'select public.is_current_user_platform_admin()',
  array[true],
  'a provisioned platform admin is recognized'
);

select results_eq(
  $$select (public.list_platform_businesses(null, null, 1, 20)->>'total')::integer$$,
  $$select businesses+2 from platform_baseline$$,
  'a platform admin lists businesses across tenants'
);

select results_eq(
  $$select jsonb_array_length(public.list_platform_businesses(null, null, 1, 1)->'items')$$,
  array[1],
  'the platform business list is paginated in the database'
);

select results_eq(
  $$select (public.list_platform_businesses('beta', null, 1, 20)->>'total')::integer$$,
  array[1],
  'business search filters by name or slug'
);

select results_eq(
  $$select (public.list_platform_businesses(null, false, 1, 20)->>'total')::integer$$,
  array[1],
  'business status filters compose with pagination'
);

select results_eq(
  $$select public.get_platform_business_detail(
    '61000000-0000-4000-8000-000000000001'
  )->'members'->0->>'email'$$,
  array['alpha-owner@example.test'::text],
  'the controlled detail exposes only the member email needed by the platform UI'
);

select lives_ok(
  $$select public.set_platform_business_active(
    '61000000-0000-4000-8000-000000000001', false
  )$$,
  'a platform admin can inactivate a business'
);

select results_eq(
  $$select active_updated_by::text from public.businesses
    where id = '61000000-0000-4000-8000-000000000001'$$,
  array['60000000-0000-4000-8000-000000000003'::text],
  'activation changes record the platform administrator'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select results_eq(
  $$select public.get_public_booking_page('alpha-club') is null$$,
  array[true],
  'an inactive business has no public booking page'
);

select results_eq(
  $$select jsonb_array_length(public.get_booking_availability(
    'alpha-club', current_date + 30, null, null
  ))$$,
  array[0],
  'an inactive business offers no availability'
);

select throws_ok(
  $$select public.create_public_appointment(
    'alpha-club', null, null, current_date + 30, '09:00', 1,
    'Public Customer', '11988887777'
  )$$,
  '22023', null,
  'an inactive business rejects public appointment creation'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$select public.create_admin_appointment(
    null, null, current_date + 30, '09:00', 1,
    'Admin Customer', '11977776666'
  )$$,
  '42501', 'admin_appointment_forbidden',
  'an inactive business rejects administrative appointment creation'
);

select results_eq(
  'select count(*)::bigint from public.businesses',
  array[1::bigint],
  'a regular user remains isolated after platform operations'
);

select set_config('request.jwt.claims', '{"sub":"60000000-0000-4000-8000-000000000003","role":"authenticated"}', true);

select lives_ok(
  $$select public.set_platform_business_active(
    '61000000-0000-4000-8000-000000000001', true
  )$$,
  'a platform admin can reactivate a business'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select results_eq(
  $$select (jsonb_array_length(public.get_booking_availability(
    'alpha-club', current_date + 30, null, null
  )) > 0)$$,
  array[true],
  'reactivation restores public availability'
);

select lives_ok(
  $$select public.create_public_appointment(
    'alpha-club', null, null, current_date + 30, '09:00', 1,
    'Restored Customer', '11966665555'
  )$$,
  'reactivation restores public appointment creation'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-4000-8000-000000000003","role":"authenticated"}', true);

select results_eq(
  $$select (public.get_platform_metrics()->>'future_appointments')::integer$$,
  $$select future_appointments+1 from platform_baseline$$,
  'platform metrics include future appointments without loading them in the browser'
);

select results_eq(
  $$select (public.get_platform_metrics()->>'total_businesses')::integer$$,
  $$select businesses+2 from platform_baseline$$,
  'platform metrics aggregate all businesses'
);

select * from finish();
rollback;
