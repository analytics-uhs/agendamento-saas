begin;

create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email, raw_user_meta_data)
values ('30000000-0000-4000-8000-000000000001', 'onboarding@example.test', '{"name":"Owner"}');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$select public.complete_business_onboarding('{
    "name":"Arena Teste",
    "slug":"arena-teste",
    "whatsapp":"51999990000",
    "groups":[
      {"position":1,"label":"Quadra","active":true,"required":true,"options":[{"name":"Quadra 1","sort_order":0}]},
      {"position":2,"label":"Esporte","active":true,"required":true,"options":[{"name":"Futevôlei","duration_minutes":60,"sort_order":0}]}
    ],
    "hours":[
      {"weekday":0,"active":false,"start_time":"08:00","end_time":"18:00"},
      {"weekday":1,"active":true,"start_time":"08:00","end_time":"18:00"},
      {"weekday":2,"active":true,"start_time":"08:00","end_time":"18:00"},
      {"weekday":3,"active":true,"start_time":"08:00","end_time":"18:00"},
      {"weekday":4,"active":true,"start_time":"08:00","end_time":"18:00"},
      {"weekday":5,"active":true,"start_time":"08:00","end_time":"18:00"},
      {"weekday":6,"active":true,"start_time":"09:00","end_time":"14:00"}
    ],
    "settings":{"duration_mode":"group_2","fixed_duration_minutes":60,"palette":{"id":"original"},"theme_preference":"system"}
  }'::jsonb)$$,
  'onboarding creates the first configured business atomically'
);

select results_eq(
  'select count(*)::bigint from public.businesses where slug = ''arena-teste''',
  array[1::bigint],
  'the business is visible to its owner'
);

select results_eq(
  'select array_agg(label order by position) from public.booking_groups',
  array[array['Quadra', 'Esporte']::text[]],
  'both generic groups are configured'
);

select results_eq(
  'select count(*)::bigint from public.business_hours',
  array[7::bigint],
  'all seven weekdays are present'
);

select results_eq(
  'select duration_mode::text from public.business_settings',
  array['group_2'::text],
  'the selected duration mode is persisted'
);

select throws_ok(
  $$select public.complete_business_onboarding('{}'::jsonb)$$,
  '23505',
  'user already has a business',
  'onboarding cannot create a second first business'
);

reset role;

select results_eq(
  $$select public, file_size_limit from storage.buckets where id = 'business-logos'$$,
  $$values (true, 2097152::bigint)$$,
  'the logo bucket is public and limited to 2 MB'
);

select * from finish();
rollback;
