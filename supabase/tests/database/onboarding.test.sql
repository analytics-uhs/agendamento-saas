begin;

create extension if not exists pgtap with schema extensions;
create temp table onboarding_tap_results (result text);
create temp table onboarding_test_payload (payload jsonb);
grant insert, select on onboarding_tap_results to authenticated;
grant select on onboarding_test_payload to authenticated;
insert into onboarding_tap_results select plan(11);

insert into onboarding_test_payload (payload)
values ('{
  "name":"Arena Teste",
  "slug":"arena-teste",
  "whatsapp":"51999990000",
  "address":"Rua do Teste, 10",
  "google_maps_url":"https://maps.google.com/?q=arena-teste",
  "instagram_url":"https://instagram.com/arena-teste",
  "facebook_url":"https://facebook.com/arena-teste",
  "groups":[
    {"position":1,"label":"Quadra","active":true,"required":true,"options":[{"name":"Quadra 1","sort_order":0}]},
    {"position":2,"label":"Esporte","active":true,"required":true,"options":[{"name":"Futevôlei","duration_minutes":60,"sort_order":0}]}
  ],
  "hours":[
    {"weekday":0,"active":false,"windows":[{"start_time":"08:00","end_time":"18:00"}]},
    {"weekday":1,"active":true,"windows":[{"start_time":"08:00","end_time":"18:00"}]},
    {"weekday":2,"active":true,"windows":[{"start_time":"08:00","end_time":"18:00"}]},
    {"weekday":3,"active":true,"windows":[{"start_time":"08:00","end_time":"18:00"}]},
    {"weekday":4,"active":true,"windows":[{"start_time":"08:00","end_time":"18:00"}]},
    {"weekday":5,"active":true,"windows":[{"start_time":"08:00","end_time":"18:00"}]},
    {"weekday":6,"active":true,"windows":[{"start_time":"09:00","end_time":"14:00"}]}
  ],
  "settings":{"duration_mode":"group_2","fixed_duration_minutes":60,"palette":{"id":"original"},"theme_preference":"system"}
}'::jsonb);

insert into auth.users (id, email, raw_user_meta_data)
values ('30000000-0000-4000-8000-000000000001', 'onboarding@example.test', '{"name":"Owner"}');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

insert into onboarding_tap_results select lives_ok(
  $$select public.complete_business_onboarding(payload) from onboarding_test_payload$$,
  'onboarding creates the first configured business atomically'
);

insert into onboarding_tap_results select results_eq(
  'select count(*)::bigint from public.businesses where slug = ''arena-teste''',
  array[1::bigint],
  'the business is visible to its owner'
);

insert into onboarding_tap_results select results_eq(
  'select array_agg(label order by position) from public.booking_groups',
  $$values (array['Quadra', 'Esporte']::text[])$$,
  'both generic groups are configured'
);

insert into onboarding_tap_results select results_eq(
  'select count(*)::bigint from public.business_hours',
  array[7::bigint],
  'all seven weekdays are present'
);

insert into onboarding_tap_results select results_eq(
  'select duration_mode::text from public.business_settings',
  array['group_2'::text],
  'the selected duration mode is persisted'
);

insert into onboarding_tap_results select results_eq(
  $$select address, instagram_url from public.businesses where slug = 'arena-teste'$$,
  $$values ('Rua do Teste, 10'::text, 'https://instagram.com/arena-teste'::text)$$,
  'onboarding persists the optional public contact fields'
);

insert into onboarding_tap_results select results_eq(
  'select theme_preference::text from public.business_settings',
  array['light'::text],
  'onboarding normalizes the legacy system preference to light'
);

insert into onboarding_tap_results select throws_ok(
  $$select public.complete_business_onboarding(payload) from onboarding_test_payload$$,
  '23505',
  'user already has a business',
  'onboarding cannot create a second first business'
);

insert into onboarding_tap_results select results_eq(
  'select module, enabled from public.business_modules order by module',
  $$values ('fiscal'::text,false),('management'::text,false),('scheduling'::text,true)$$,
  'legacy onboarding includes default modules in its transaction'
);

reset role;

insert into onboarding_tap_results select results_eq(
  $$select count(*)::bigint
    from private.founder_offer_claims as claim
    join public.businesses as business on business.id = claim.business_id
    where business.slug = 'arena-teste'$$,
  array[1::bigint],
  'a successfully completed onboarding claims exactly one founder spot'
);

insert into onboarding_tap_results select results_eq(
  $$select public, file_size_limit from storage.buckets where id = 'business-logos'$$,
  $$values (true, 2097152::bigint)$$,
  'the logo bucket is public and limited to 2 MB'
);

insert into onboarding_tap_results select * from finish();
select result from onboarding_tap_results;
rollback;
