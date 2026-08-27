begin;
create extension if not exists pgtap with schema extensions;
create temp table resource_block_tap_results(result text);
grant insert, select on resource_block_tap_results to anon, authenticated;
insert into resource_block_tap_results select plan(33);

insert into auth.users(id,email) values
('c1000000-0000-4000-8000-000000000001','blocks-day-owner@test.local'),
('c1000000-0000-4000-8000-000000000002','blocks-slot-admin@test.local');
insert into public.businesses(id,name,slug,active) values
('c1100000-0000-4000-8000-000000000001','Blocks Day','blocks-day',true),
('c1100000-0000-4000-8000-000000000002','Blocks Slot','blocks-slot',true);
insert into public.business_members(business_id,user_id,role) values
('c1100000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','owner'),
('c1100000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000002','admin');
insert into public.business_settings(business_id,duration_mode,fixed_duration_minutes,allow_multiple_blocks) values
('c1100000-0000-4000-8000-000000000001','fixed',60,false),
('c1100000-0000-4000-8000-000000000002','fixed',60,false);
insert into public.business_hours(business_id,weekday,active,start_time,end_time)
select business_id, weekday, true, '08:00', '18:00'
from (values ('c1100000-0000-4000-8000-000000000001'::uuid),('c1100000-0000-4000-8000-000000000002'::uuid)) business(business_id)
cross join generate_series(0,6) weekday;
insert into public.booking_groups(id,business_id,position,label,intent_name,occupancy_mode,active,required,sort_order) values
('c1200000-0000-4000-8000-000000000001','c1100000-0000-4000-8000-000000000001',3,'Espaço','Espaço','day',true,false,3),
('c1200000-0000-4000-8000-000000000002','c1100000-0000-4000-8000-000000000002',3,'Equipamento','Equipamento','time_slot',true,false,3);
insert into public.booking_options(id,business_id,group_id,name,active,sort_order) values
('c1300000-0000-4000-8000-000000000001','c1100000-0000-4000-8000-000000000001','c1200000-0000-4000-8000-000000000001','Espaço A',true,1),
('c1300000-0000-4000-8000-000000000002','c1100000-0000-4000-8000-000000000001','c1200000-0000-4000-8000-000000000001','Espaço B',true,2),
('c1300000-0000-4000-8000-000000000003','c1100000-0000-4000-8000-000000000001','c1200000-0000-4000-8000-000000000001','Espaço inativo',false,3),
('c1300000-0000-4000-8000-000000000004','c1100000-0000-4000-8000-000000000002','c1200000-0000-4000-8000-000000000002','Projetor A',true,1),
('c1300000-0000-4000-8000-000000000005','c1100000-0000-4000-8000-000000000002','c1200000-0000-4000-8000-000000000002','Projetor B',true,2);

set local role anon;
insert into resource_block_tap_results select throws_ok(
  $$select public.create_admin_resource_blocks(array['c1300000-0000-4000-8000-000000000001'::uuid],current_date+10)$$,
  '42501','permission denied for function create_admin_resource_blocks','anon cannot execute resource block mutation');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);

insert into resource_block_tap_results select lives_ok(
  $$select public.create_admin_resource_blocks(array['c1300000-0000-4000-8000-000000000001'::uuid],current_date+10,null,null,'Manutenção')$$,
  'owner creates a day block');
insert into resource_block_tap_results select is((select count(*)::integer from public.resource_blocks where option_id='c1300000-0000-4000-8000-000000000001' and block_date=current_date+10 and active),1,'day block has no synthetic time');
insert into resource_block_tap_results select is((select count(*)::integer from public.resource_allocations where resource_block_id is not null and option_id='c1300000-0000-4000-8000-000000000001' and active),1,'day block creates its allocation source');
insert into resource_block_tap_results select is((public.get_public_complementary_availability('blocks-day',current_date+10,null,null)->'options'->0->>'available')::boolean,false,'day block makes public option unavailable');
insert into resource_block_tap_results select is((public.get_admin_complementary_availability(current_date+10,null,null)->'options'->0->>'available')::boolean,false,'day block makes Admin option unavailable');
insert into resource_block_tap_results select throws_ok(
  format($$select public.create_public_reservation('blocks-day',%L::jsonb)$$,jsonb_build_object('customer_name','Cliente','customer_whatsapp','53999990001','complementary',jsonb_build_object('option_id','c1300000-0000-4000-8000-000000000001','occupancy_mode','day','date',current_date+10))),
  '23P01','reservation_complementary_conflict','day block prevents public reservation');
insert into resource_block_tap_results select throws_ok(
  format($$select public.create_admin_reservation(%L::jsonb)$$,jsonb_build_object('customer_name','Admin','customer_whatsapp','53999990002','complementary',jsonb_build_object('option_id','c1300000-0000-4000-8000-000000000001','occupancy_mode','day','date',current_date+10))),
  '23P01','reservation_complementary_conflict','day block prevents Admin reservation');
insert into resource_block_tap_results select throws_ok(
  $$select public.create_admin_resource_blocks(array['c1300000-0000-4000-8000-000000000001'::uuid],current_date+10)$$,
  '23P01','resource_block_conflict','block cannot overlap another active block');
insert into resource_block_tap_results select lives_ok(
  $q$select public.cancel_admin_resource_block((select id from public.resource_blocks where option_id='c1300000-0000-4000-8000-000000000001' and block_date=current_date+10),'single')$q$,
  'owner cancels one day block');
insert into resource_block_tap_results select is((select count(*)::integer from public.resource_allocations where option_id='c1300000-0000-4000-8000-000000000001' and active),0,'cancellation deactivates allocation');
insert into resource_block_tap_results select is((public.get_public_complementary_availability('blocks-day',current_date+10,null,null)->'options'->0->>'available')::boolean,true,'cancelled block releases public availability');

insert into resource_block_tap_results select lives_ok(
  format($$select public.create_admin_reservation(%L::jsonb)$$,jsonb_build_object('customer_name','Ocupante','customer_whatsapp','53999990003','complementary',jsonb_build_object('option_id','c1300000-0000-4000-8000-000000000002','occupancy_mode','day','date',current_date+11))),
  'existing complementary reservation fixture is created');
insert into resource_block_tap_results select throws_ok(
  $$select public.create_admin_resource_blocks(array['c1300000-0000-4000-8000-000000000001'::uuid,'c1300000-0000-4000-8000-000000000002'::uuid],current_date+11)$$,
  '23P01','resource_block_conflict','one occupied option rolls back a multi-resource block');
insert into resource_block_tap_results select is((select count(*)::integer from public.resource_blocks where option_id='c1300000-0000-4000-8000-000000000001' and block_date=current_date+11),0,'multi-resource conflict leaves no partial block');
insert into resource_block_tap_results select throws_ok(
  $$select public.create_admin_resource_blocks(array['c1300000-0000-4000-8000-000000000004'::uuid],current_date+12)$$,
  '22023','resource_block_option_invalid','cross-tenant option is rejected');
insert into resource_block_tap_results select throws_ok(
  $$select public.create_admin_resource_blocks(array['c1300000-0000-4000-8000-000000000003'::uuid],current_date+12)$$,
  '22023','resource_block_option_invalid','inactive option is rejected');
update public.booking_groups set active=false where id='c1200000-0000-4000-8000-000000000001';
insert into resource_block_tap_results select throws_ok(
  $$select public.create_admin_resource_blocks(array['c1300000-0000-4000-8000-000000000001'::uuid],current_date+12)$$,
  '22023','resource_block_group_inactive','inactive group is rejected');
update public.booking_groups set active=true where id='c1200000-0000-4000-8000-000000000001';

select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
insert into resource_block_tap_results select throws_ok(
  $q$select public.cancel_admin_resource_block((select id from public.resource_blocks where business_id='c1100000-0000-4000-8000-000000000001' limit 1),'single')$q$,
  '42501','resource_block_not_found','another business cannot cancel a block');
insert into resource_block_tap_results select lives_ok(
  $$select public.create_admin_resource_blocks(array['c1300000-0000-4000-8000-000000000004'::uuid],current_date+20,'14:00','17:00','Revisão')$$,
  'admin creates a time-slot block outside no constraint bypass');
insert into resource_block_tap_results select is((select count(*)::integer from public.resource_blocks where option_id='c1300000-0000-4000-8000-000000000004' and start_time='14:00' and end_time='17:00' and active),1,'time-slot block preserves its interval');
insert into resource_block_tap_results select throws_ok(
  format($$select public.create_admin_reservation(%L::jsonb)$$,jsonb_build_object('customer_name','Conflito','customer_whatsapp','53999990004','complementary',jsonb_build_object('option_id','c1300000-0000-4000-8000-000000000004','occupancy_mode','time_slot','date',current_date+20,'start_time','15:00','end_time','16:00'))),
  '23P01','reservation_complementary_conflict','time-slot block prevents overlapping reservation');
insert into resource_block_tap_results select is((public.get_admin_complementary_availability(current_date+20,'17:00','18:00')->'options'->0->>'available')::boolean,true,'adjacent time-slot remains available');
insert into resource_block_tap_results select lives_ok(
  format($$select public.create_admin_reservation(%L::jsonb)$$,jsonb_build_object('customer_name','Reserva','customer_whatsapp','53999990005','complementary',jsonb_build_object('option_id','c1300000-0000-4000-8000-000000000005','occupancy_mode','time_slot','date',current_date+21,'start_time','10:00','end_time','11:00'))),
  'time-slot reservation fixture is created');
insert into resource_block_tap_results select throws_ok(
  $$select public.create_admin_resource_blocks(array['c1300000-0000-4000-8000-000000000005'::uuid],current_date+21,'10:30','11:30')$$,
  '23P01','resource_block_conflict','block cannot overlap an existing reservation');
insert into resource_block_tap_results select lives_ok(
  $$select public.create_admin_resource_blocks(array['c1300000-0000-4000-8000-000000000004'::uuid,'c1300000-0000-4000-8000-000000000005'::uuid],current_date+22,'08:00','09:00')$$,
  'multiple available resources block atomically');
insert into resource_block_tap_results select is((select count(*)::integer from public.resource_blocks where block_date=current_date+22 and active),2,'multi-resource operation creates every block');
insert into resource_block_tap_results select lives_ok(
  $$select public.create_admin_resource_blocks(array['c1300000-0000-4000-8000-000000000004'::uuid],current_date+30,'12:00','13:00','Semanal',true,3)$$,
  'weekly block series is created');
insert into resource_block_tap_results select is((select count(*)::integer from public.resource_blocks block join public.resource_block_series series on series.id=block.series_id where series.reason='Semanal'),3,'limited recurring series materializes exact occurrence count');
insert into resource_block_tap_results select lives_ok(
  $q$select public.materialize_resource_blocks((select id from public.resource_block_series where reason='Semanal'),null)$q$,
  'resource block materialization is idempotent');
insert into resource_block_tap_results select lives_ok(
  $q$select public.cancel_admin_resource_block((select block.id from public.resource_blocks block join public.resource_block_series series on series.id=block.series_id where series.reason='Semanal' order by block.block_date limit 1),'future')$q$,
  'this-and-future cancellation closes the series');
insert into resource_block_tap_results select is((select count(*)::integer from public.resource_blocks block join public.resource_block_series series on series.id=block.series_id where series.reason='Semanal' and block.active),0,'future cancellation releases every materialized allocation');
insert into resource_block_tap_results select is((select count(*)::integer from public.resource_allocations allocation left join public.reservation_resources resource on resource.id=allocation.reservation_resource_id left join public.resource_blocks block on block.id=allocation.resource_block_id where resource.id is null and block.id is null),0,'no orphan allocation remains');

reset role;
insert into resource_block_tap_results select * from finish();
select result from resource_block_tap_results;
rollback;
