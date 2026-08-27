begin;

create extension if not exists pgtap with schema extensions;
create temp table public_group_metadata_tap_results (result text);
grant insert, select on public_group_metadata_tap_results to anon, authenticated;
insert into public_group_metadata_tap_results select plan(8);

insert into public.businesses (id, name, slug, active)
values
  ('ab000000-0000-4000-8000-000000000001', 'Negócio legado', 'public-metadata-legacy', true),
  ('ab000000-0000-4000-8000-000000000002', 'Negócio complementar', 'public-metadata-complementary', true);

insert into public.business_settings (business_id)
values
  ('ab000000-0000-4000-8000-000000000001'),
  ('ab000000-0000-4000-8000-000000000002');

insert into public.booking_groups (
  id, business_id, position, label, active, required, sort_order, intent_name, occupancy_mode
) values
  ('ab100000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000001', 1, 'Escolha principal', true, true, 1, null, null),
  ('ab100000-0000-4000-8000-000000000002', 'ab000000-0000-4000-8000-000000000001', 2, 'Escolha secundária', true, true, 2, null, null),
  ('ab100000-0000-4000-8000-000000000003', 'ab000000-0000-4000-8000-000000000002', 1, 'Escolha principal', true, true, 1, null, null),
  ('ab100000-0000-4000-8000-000000000004', 'ab000000-0000-4000-8000-000000000002', 3, 'Escolha o apoio', true, false, 3, 'Espaço', 'day');

insert into public.booking_options (id, business_id, group_id, name, active, sort_order)
values
  ('ab200000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000001', 'ab100000-0000-4000-8000-000000000001', 'Principal A', true, 1),
  ('ab200000-0000-4000-8000-000000000002', 'ab000000-0000-4000-8000-000000000001', 'ab100000-0000-4000-8000-000000000002', 'Secundária A', true, 1),
  ('ab200000-0000-4000-8000-000000000003', 'ab000000-0000-4000-8000-000000000002', 'ab100000-0000-4000-8000-000000000003', 'Principal B', true, 1),
  ('ab200000-0000-4000-8000-000000000004', 'ab000000-0000-4000-8000-000000000002', 'ab100000-0000-4000-8000-000000000004', 'Apoio B', true, 1);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

insert into public_group_metadata_tap_results select results_eq(
  $$select count(*)::bigint from jsonb_array_elements(public.get_public_booking_page('public-metadata-legacy')->'groups')$$,
  array[2::bigint],
  'legacy businesses keep their two public groups'
);
insert into public_group_metadata_tap_results select results_eq(
  $$select bool_and(not item ? 'intent_name' and not item ? 'occupancy_mode')
    from jsonb_array_elements(public.get_public_booking_page('public-metadata-legacy')->'groups') as item$$,
  array[true],
  'legacy group objects do not gain complementary metadata keys'
);
insert into public_group_metadata_tap_results select results_eq(
  $$select item->>'label' from jsonb_array_elements(public.get_public_booking_page('public-metadata-legacy')->'groups') as item order by (item->>'position')::integer$$,
  array['Escolha principal'::text, 'Escolha secundária'::text],
  'legacy labels remain unchanged'
);
insert into public_group_metadata_tap_results select results_eq(
  $$select item->>'intent_name' from jsonb_array_elements(public.get_public_booking_page('public-metadata-complementary')->'groups') as item where item->>'position' = '3'$$,
  array['Espaço'::text],
  'complementary intent_name is curated publicly'
);
insert into public_group_metadata_tap_results select results_eq(
  $$select item->>'occupancy_mode' from jsonb_array_elements(public.get_public_booking_page('public-metadata-complementary')->'groups') as item where item->>'position' = '3'$$,
  array['day'::text],
  'complementary occupancy_mode is curated publicly'
);
insert into public_group_metadata_tap_results select results_eq(
  $$select bool_and(not item ? 'intent_name' and not item ? 'occupancy_mode')
    from jsonb_array_elements(public.get_public_booking_page('public-metadata-complementary')->'groups') as item
    where item->>'position' <> '3'$$,
  array[true],
  'primary groups do not expose complementary metadata'
);
insert into public_group_metadata_tap_results select results_eq(
  $$select item->'options'->0->>'name' from jsonb_array_elements(public.get_public_booking_page('public-metadata-complementary')->'groups') as item where item->>'position' = '3'$$,
  array['Apoio B'::text],
  'existing curated option fields remain available'
);
insert into public_group_metadata_tap_results select results_eq(
  $$select array_agg(key order by key) from jsonb_object_keys(public.get_public_booking_page('public-metadata-legacy')) as key$$,
  $$values (array['business','groups','hours','settings']::text[])$$,
  'top-level legacy payload shape remains unchanged'
);

reset role;
insert into public_group_metadata_tap_results select * from finish();
select result from public_group_metadata_tap_results;
rollback;
