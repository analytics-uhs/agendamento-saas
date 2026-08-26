begin;

create extension if not exists pgtap with schema extensions;
create temp table complementary_catalog_tap_results (result text);
grant insert, select on complementary_catalog_tap_results to authenticated;
insert into complementary_catalog_tap_results select plan(12);

insert into auth.users (id, email, raw_user_meta_data)
values ('c1000000-0000-4000-8000-000000000001', 'catalog-owner@example.test', '{"name":"Catalog Owner"}');

insert into public.businesses (id, name, slug)
values
  ('c2000000-0000-4000-8000-000000000001', 'Catalog A', 'catalog-a'),
  ('c2000000-0000-4000-8000-000000000002', 'Catalog B', 'catalog-b');

insert into public.business_members (business_id, user_id, role)
values ('c2000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'owner');

insert into complementary_catalog_tap_results select has_column(
  'public', 'booking_groups', 'occupancy_mode',
  'booking_groups exposes the complementary occupancy mode'
);

insert into complementary_catalog_tap_results select has_column(
  'public', 'booking_groups', 'intent_name',
  'booking_groups exposes the short reservation intent name'
);

insert into complementary_catalog_tap_results select col_type_is(
  'public', 'booking_groups', 'occupancy_mode',
  'public.booking_group_occupancy_mode',
  'occupancy_mode uses the constrained database enum'
);

insert into complementary_catalog_tap_results select lives_ok(
  $$insert into public.booking_groups (business_id, position, label, occupancy_mode, intent_name)
    values
      ('c2000000-0000-4000-8000-000000000001', 1, 'Principal', null, 'Agenda'),
      ('c2000000-0000-4000-8000-000000000001', 2, 'Secundário', null, 'Atividade')$$,
  'positions 1 and 2 remain compatible without occupancy_mode'
);

insert into complementary_catalog_tap_results select lives_ok(
  $$insert into public.booking_groups (business_id, position, label, occupancy_mode, intent_name)
    values ('c2000000-0000-4000-8000-000000000001', 3, 'Complementar', 'day', 'Espaço')$$,
  'position 3 accepts a complementary catalog with occupancy_mode'
);

insert into complementary_catalog_tap_results select results_eq(
  $$select position, occupancy_mode::text, intent_name
    from public.booking_groups
    where business_id = 'c2000000-0000-4000-8000-000000000001' and position = 3$$,
  $$values (3::smallint, 'day'::text, 'Espaço'::text)$$,
  'the complementary catalog values are persisted'
);

insert into complementary_catalog_tap_results select throws_ok(
  $$insert into public.booking_groups (business_id, position, label)
    values ('c2000000-0000-4000-8000-000000000002', 3, 'Sem modo')$$,
  '23514', null,
  'position 3 requires occupancy_mode'
);

insert into complementary_catalog_tap_results select throws_ok(
  $$insert into public.booking_groups (business_id, position, label, occupancy_mode)
    values ('c2000000-0000-4000-8000-000000000002', 1, 'Principal inválido', 'time_slot')$$,
  '23514', null,
  'positions 1 and 2 reject occupancy_mode'
);

insert into complementary_catalog_tap_results select throws_ok(
  $$insert into public.booking_groups (business_id, position, label, occupancy_mode)
    values ('c2000000-0000-4000-8000-000000000002', 4, 'Posição inválida', 'day')$$,
  '23514', null,
  'positions outside 1, 2 and 3 remain invalid'
);

insert into complementary_catalog_tap_results select throws_ok(
  $$insert into public.booking_groups (business_id, position, label, occupancy_mode)
    values ('c2000000-0000-4000-8000-000000000001', 3, 'Segundo complementar', 'time_slot')$$,
  '23505', null,
  'a business can have at most one complementary group'
);

insert into public.booking_groups (business_id, position, label, occupancy_mode)
values ('c2000000-0000-4000-8000-000000000002', 3, 'Complementar B', 'time_slot');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

insert into complementary_catalog_tap_results select results_eq(
  $$select count(*)::bigint from public.booking_groups where position = 3$$,
  array[1::bigint],
  'RLS exposes only the complementary group of the member business'
);

reset role;

insert into complementary_catalog_tap_results select results_eq(
  $$select has_table_privilege('anon', 'public.booking_groups', 'select')$$,
  array[false],
  'anonymous users receive no direct catalog-table access'
);

insert into complementary_catalog_tap_results select * from finish();
select result from complementary_catalog_tap_results;
rollback;
