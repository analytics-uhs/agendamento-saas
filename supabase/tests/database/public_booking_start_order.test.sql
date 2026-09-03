begin;
create extension if not exists pgtap with schema extensions;
create temp table start_order_results (result text);
grant select, insert on start_order_results to anon, authenticated;
insert into start_order_results select plan(12);

insert into auth.users(id,email,raw_user_meta_data) values
('ac000000-0000-4000-8000-000000000001','order-owner@example.test','{}'),
('ac000000-0000-4000-8000-000000000002','order-admin@example.test','{}');
insert into public.businesses(id,name,slug) values
('ac100000-0000-4000-8000-000000000001','Order A','test-start-order-a'),
('ac100000-0000-4000-8000-000000000002','Order B','test-start-order-b');
insert into public.business_members(business_id,user_id,role) values
('ac100000-0000-4000-8000-000000000001','ac000000-0000-4000-8000-000000000001','owner'),
('ac100000-0000-4000-8000-000000000001','ac000000-0000-4000-8000-000000000002','admin');
insert into public.business_settings(business_id) values
('ac100000-0000-4000-8000-000000000001'),('ac100000-0000-4000-8000-000000000002');
insert into start_order_results select is(
 (select public_booking_start_order from public.business_settings where business_id='ac100000-0000-4000-8000-000000000001'),
 'service_first','legacy/default settings keep service-first');
insert into start_order_results select throws_ok(
 $$update public.business_settings set public_booking_start_order='invalid' where business_id='ac100000-0000-4000-8000-000000000001'$$,
 '23514',null,'unknown order rejected');
insert into start_order_results select throws_ok(
 $$update public.business_settings set public_booking_start_order=null where business_id='ac100000-0000-4000-8000-000000000001'$$,
 '23502',null,'null order rejected');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ac000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into start_order_results select lives_ok(
 $$update public.business_settings set public_booking_start_order='date_first' where business_id='ac100000-0000-4000-8000-000000000001'$$,
 'owner can save order');
insert into start_order_results select is(
 (select public_booking_start_order from public.business_settings where business_id='ac100000-0000-4000-8000-000000000001'),
 'date_first','saved order persists');
update public.business_settings set public_booking_start_order='date_first' where business_id='ac100000-0000-4000-8000-000000000002';
reset role;
insert into start_order_results select is(
 (select public_booking_start_order from public.business_settings where business_id='ac100000-0000-4000-8000-000000000002'),
 'service_first','cross-tenant update cannot change settings');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ac000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
insert into start_order_results select lives_ok(
 $$update public.business_settings set public_booking_start_order='date_first' where business_id='ac100000-0000-4000-8000-000000000001'$$,
 'admin can save order');
reset role;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
insert into start_order_results select throws_ok('select * from public.business_settings','42501',null,'anon cannot read settings table');
insert into start_order_results select throws_ok(
 $$update public.business_settings set public_booking_start_order='date_first'$$,'42501',null,'anon cannot mutate settings');
insert into start_order_results select is(public.get_public_booking_page('test-start-order-a')#>>'{settings,public_booking_start_order}',
 'date_first','public metadata exposes configured order');
insert into start_order_results select is(public.get_public_booking_page('test-start-order-b')#>>'{settings,public_booking_start_order}',
 'service_first','public metadata exposes default order');
insert into start_order_results select results_eq(
 $$select array_agg(key order by key) from jsonb_object_keys(public.get_public_booking_page('test-start-order-a')->'settings') key$$,
 $$values(array['allow_multiple_blocks','duration_mode','fixed_duration_minutes','palette','public_booking_start_order','theme_preference']::text[])$$,
 'curated metadata adds only navigation setting');
reset role;
insert into start_order_results select * from finish();
select result from start_order_results;
rollback;
