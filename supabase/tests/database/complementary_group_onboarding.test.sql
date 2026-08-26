begin;

create extension if not exists pgtap with schema extensions;
create temp table complementary_onboarding_tap_results (result text);
create temp table complementary_onboarding_payloads (key text primary key, payload jsonb not null);
grant insert, select on complementary_onboarding_tap_results to authenticated;
grant select on complementary_onboarding_payloads to authenticated;
insert into complementary_onboarding_tap_results select plan(15);

insert into complementary_onboarding_payloads (key, payload)
values ('base', '{
  "name":"Negócio Complementar",
  "slug":"complementary-base",
  "whatsapp":"53999990000",
  "groups":[
    {"position":1,"label":"Recurso","active":true,"required":true,"options":[{"name":"Recurso 1","sort_order":0}]},
    {"position":2,"label":"Atividade","active":true,"required":true,"options":[{"name":"Atividade 1","duration_minutes":60,"sort_order":0}]}
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
  "settings":{"duration_mode":"group_2","fixed_duration_minutes":60,"palette":{"id":"original"},"theme_preference":"light"}
}'::jsonb);

insert into complementary_onboarding_payloads (key, payload)
select variant.key, jsonb_set(jsonb_set(base.payload, '{name}', to_jsonb(variant.name)), '{slug}', to_jsonb(variant.slug))
from complementary_onboarding_payloads as base
cross join (values
  ('legacy', 'Negócio Legado', 'complementary-legacy'),
  ('day', 'Negócio Day', 'complementary-day'),
  ('time_slot', 'Negócio Time Slot', 'complementary-time-slot'),
  ('missing_mode', 'Negócio Sem Modo', 'complementary-missing-mode'),
  ('no_options', 'Negócio Sem Opções', 'complementary-no-options'),
  ('rollback', 'Negócio Rollback', 'complementary-rollback')
) as variant(key, name, slug)
where base.key = 'base';

update complementary_onboarding_payloads
set payload = jsonb_set(payload, '{groups}', (payload -> 'groups') || '[{
  "position":3,
  "label":"Espaço adicional",
  "intent_name":"Espaço",
  "occupancy_mode":"day",
  "active":true,
  "required":true,
  "options":[
    {"name":"Espaço 2","sort_order":1},
    {"name":"Espaço 1","sort_order":0}
  ]
}]'::jsonb)
where key = 'day';

update complementary_onboarding_payloads
set payload = jsonb_set(payload, '{groups}', (payload -> 'groups') || '[{
  "position":3,
  "label":"Equipamento",
  "intent_name":"Equipamento",
  "occupancy_mode":"time_slot",
  "active":true,
  "required":false,
  "options":[{"name":"Projetor","sort_order":0}]
}]'::jsonb)
where key = 'time_slot';

update complementary_onboarding_payloads
set payload = jsonb_set(payload, '{groups}', (payload -> 'groups') || '[{
  "position":3,"label":"Sem modo","active":true,"options":[{"name":"Opção"}]
}]'::jsonb)
where key = 'missing_mode';

update complementary_onboarding_payloads
set payload = jsonb_set(payload, '{groups}', (payload -> 'groups') || '[{
  "position":3,"label":"Sem opções","occupancy_mode":"day","active":true,"options":[]
}]'::jsonb)
where key = 'no_options';

update complementary_onboarding_payloads
set payload = jsonb_set(payload, '{groups}', (payload -> 'groups') || jsonb_build_array(jsonb_build_object(
  'position', 3,
  'label', repeat('x', 81),
  'occupancy_mode', 'day',
  'active', true,
  'options', jsonb_build_array(jsonb_build_object('name', 'Opção'))
)))
where key = 'rollback';

insert into auth.users (id, email, raw_user_meta_data)
values
  ('e1000000-0000-4000-8000-000000000001', 'legacy-onboarding@example.test', '{"name":"Legacy"}'),
  ('e1000000-0000-4000-8000-000000000002', 'day-onboarding@example.test', '{"name":"Day"}'),
  ('e1000000-0000-4000-8000-000000000003', 'time-onboarding@example.test', '{"name":"Time"}'),
  ('e1000000-0000-4000-8000-000000000004', 'missing-mode@example.test', '{"name":"Missing"}'),
  ('e1000000-0000-4000-8000-000000000005', 'no-options@example.test', '{"name":"No options"}'),
  ('e1000000-0000-4000-8000-000000000006', 'rollback-onboarding@example.test', '{"name":"Rollback"}');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into complementary_onboarding_tap_results select lives_ok(
  $$select public.complete_business_onboarding(payload) from complementary_onboarding_payloads where key = 'legacy'$$,
  'legacy onboarding with positions 1 and 2 remains valid'
);
insert into complementary_onboarding_tap_results select results_eq(
  $$select count(*)::bigint from public.booking_groups$$,
  array[2::bigint],
  'legacy onboarding still creates only two groups'
);
reset role;
insert into complementary_onboarding_tap_results select results_eq(
  $$select count(*)::bigint
    from private.founder_offer_claims as claim
    join public.businesses as business on business.id = claim.business_id
    where business.slug = 'complementary-legacy'$$,
  array[1::bigint],
  'legacy onboarding still records one founder claim'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
insert into complementary_onboarding_tap_results select lives_ok(
  $$select public.complete_business_onboarding(payload) from complementary_onboarding_payloads where key = 'day'$$,
  'onboarding atomically creates a day complementary group'
);
insert into complementary_onboarding_tap_results select results_eq(
  $$select booking_group.occupancy_mode::text, booking_group.intent_name, booking_group.required
    from public.booking_groups as booking_group
    join public.businesses as business on business.id = booking_group.business_id
    where business.slug = 'complementary-day' and booking_group.position = 3$$,
  $$values ('day'::text, 'Espaço'::text, false)$$,
  'day mode and intent name persist without using required as optionality'
);
insert into complementary_onboarding_tap_results select results_eq(
  $$select array_agg(booking_option.name order by booking_option.sort_order)
    from public.booking_options as booking_option
    join public.businesses as business on business.id = booking_option.business_id
    join public.booking_groups as booking_group on booking_group.id = booking_option.group_id
    where business.slug = 'complementary-day' and booking_group.position = 3$$,
  $$values (array['Espaço 1', 'Espaço 2']::text[])$$,
  'complementary options preserve configured ordering'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
insert into complementary_onboarding_tap_results select lives_ok(
  $$select public.complete_business_onboarding(payload) from complementary_onboarding_payloads where key = 'time_slot'$$,
  'onboarding atomically creates a time-slot complementary group'
);
insert into complementary_onboarding_tap_results select results_eq(
  $$select booking_group.occupancy_mode::text
    from public.booking_groups as booking_group
    join public.businesses as business on business.id = booking_group.business_id
    where business.slug = 'complementary-time-slot' and booking_group.position = 3$$,
  array['time_slot'::text],
  'time-slot occupancy persists correctly'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
insert into complementary_onboarding_tap_results select throws_ok(
  $$select public.complete_business_onboarding(payload) from complementary_onboarding_payloads where key = 'missing_mode'$$,
  '22023', 'complementary_group_occupancy_mode_required',
  'active complementary group requires occupancy mode'
);
insert into complementary_onboarding_tap_results select results_eq(
  $$select count(*)::bigint from public.businesses where slug = 'complementary-missing-mode'$$,
  array[0::bigint],
  'invalid occupancy mode leaves no business behind'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
insert into complementary_onboarding_tap_results select throws_ok(
  $$select public.complete_business_onboarding(payload) from complementary_onboarding_payloads where key = 'no_options'$$,
  '22023', 'complementary_group_options_invalid',
  'active complementary group requires at least one option'
);
insert into complementary_onboarding_tap_results select results_eq(
  $$select count(*)::bigint from public.businesses where slug = 'complementary-no-options'$$,
  array[0::bigint],
  'missing complementary options leave no business behind'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
insert into complementary_onboarding_tap_results select throws_ok(
  $$select public.complete_business_onboarding(payload) from complementary_onboarding_payloads where key = 'rollback'$$,
  '23514', null,
  'a complementary insert failure rolls back the combined onboarding'
);
reset role;
insert into complementary_onboarding_tap_results select results_eq(
  $$select count(*)::bigint from public.businesses where slug = 'complementary-rollback'$$,
  array[0::bigint],
  'a post-business complementary failure rolls back the business'
);
insert into complementary_onboarding_tap_results select results_eq(
  $$select count(*)::bigint
    from private.founder_offer_claims as claim
    join public.businesses as business on business.id = claim.business_id
    where business.slug = 'complementary-rollback'$$,
  array[0::bigint],
  'a failed complementary onboarding leaves no founder claim'
);

insert into complementary_onboarding_tap_results select * from finish();
select result from complementary_onboarding_tap_results;
rollback;
