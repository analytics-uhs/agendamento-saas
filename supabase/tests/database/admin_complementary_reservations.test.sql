begin;
create extension if not exists pgtap with schema extensions;
create temp table admin_complementary_tap_results(result text);
grant insert,select on admin_complementary_tap_results to anon,authenticated;
insert into admin_complementary_tap_results select plan(16);

insert into auth.users(id,email) values
('b7000000-0000-4000-8000-000000000001','admin-complement-owner@test.local'),
('b7000000-0000-4000-8000-000000000002','admin-complement-other@test.local');
insert into public.businesses(id,name,slug,active) values
('b7100000-0000-4000-8000-000000000001','Admin Day','admin-complement-day',true),
('b7100000-0000-4000-8000-000000000002','Admin Slot','admin-complement-slot',true);
insert into public.business_members(business_id,user_id,role) values
('b7100000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000001','owner'),
('b7100000-0000-4000-8000-000000000002','b7000000-0000-4000-8000-000000000002','admin');
insert into public.business_settings(business_id,duration_mode,fixed_duration_minutes,allow_multiple_blocks) values
('b7100000-0000-4000-8000-000000000001','fixed',60,false),('b7100000-0000-4000-8000-000000000002','fixed',60,false);
insert into public.booking_groups(id,business_id,position,label,intent_name,occupancy_mode,active,required,sort_order) values
('b7200000-0000-4000-8000-000000000001','b7100000-0000-4000-8000-000000000001',1,'Principal',null,null,true,true,1),
('b7200000-0000-4000-8000-000000000002','b7100000-0000-4000-8000-000000000001',3,'Complementar','Espaço','day',true,false,3),
('b7200000-0000-4000-8000-000000000003','b7100000-0000-4000-8000-000000000002',3,'Equipamento','Equipamento','time_slot',true,false,3);
insert into public.booking_options(id,business_id,group_id,name,active,sort_order) values
('b7300000-0000-4000-8000-000000000001','b7100000-0000-4000-8000-000000000001','b7200000-0000-4000-8000-000000000001','Principal A',true,1),
('b7300000-0000-4000-8000-000000000002','b7100000-0000-4000-8000-000000000001','b7200000-0000-4000-8000-000000000002','Espaço A',true,1),
('b7300000-0000-4000-8000-000000000003','b7100000-0000-4000-8000-000000000001','b7200000-0000-4000-8000-000000000002','Espaço inativo',false,2),
('b7300000-0000-4000-8000-000000000004','b7100000-0000-4000-8000-000000000002','b7200000-0000-4000-8000-000000000003','Projetor',true,1);

set local role anon;
insert into admin_complementary_tap_results select throws_ok($$select public.create_admin_reservation('{}')$$,'42501','permission denied for function create_admin_reservation','anon cannot execute the Admin reservation RPC');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b7000000-0000-4000-8000-000000000001","role":"authenticated"}',true);

insert into admin_complementary_tap_results select lives_ok(format($$select public.create_admin_reservation(%L::jsonb)$$,jsonb_build_object('customer_name','Principal','customer_whatsapp','53999990001','primary',jsonb_build_object('group_1_option_id','b7300000-0000-4000-8000-000000000001','group_2_option_id',null,'date',current_date+20,'start_time','06:00','blocks',1))),'primary-only Admin reservation works outside business hours');
insert into admin_complementary_tap_results select is((select count(*)::integer from public.appointments where customer_name='Principal' and reservation_id is not null),1,'primary appointment links to reservation');
insert into admin_complementary_tap_results select lives_ok(format($$select public.create_admin_reservation(%L::jsonb)$$,jsonb_build_object('customer_name','Dia Fechado','customer_whatsapp','53999990002','complementary',jsonb_build_object('option_id','b7300000-0000-4000-8000-000000000002','occupancy_mode','day','date',current_date+21))),'day reservation works without business hours');
insert into admin_complementary_tap_results select is((select count(*)::integer from public.reservation_resources where option_id='b7300000-0000-4000-8000-000000000002' and reservation_date=current_date+21),1,'day resource is materialized');
insert into admin_complementary_tap_results select throws_ok(format($$select public.create_admin_reservation(%L::jsonb)$$,jsonb_build_object('customer_name','Conflito','customer_whatsapp','53999990003','complementary',jsonb_build_object('option_id','b7300000-0000-4000-8000-000000000002','occupancy_mode','day','date',current_date+21))),'23P01','reservation_complementary_conflict','day conflict remains enforced');
insert into admin_complementary_tap_results select lives_ok(format($$select public.create_admin_reservation(%L::jsonb)$$,jsonb_build_object('customer_name','Combinada','customer_whatsapp','53999990004','primary',jsonb_build_object('group_1_option_id','b7300000-0000-4000-8000-000000000001','group_2_option_id',null,'date',current_date+22,'start_time','22:00','blocks',1),'complementary',jsonb_build_object('option_id','b7300000-0000-4000-8000-000000000002','occupancy_mode','day','date',current_date+22))),'combined Admin reservation is atomic and ignores hours');
insert into admin_complementary_tap_results select is((select count(*)::integer from public.appointments appointment join public.reservation_resources resource on resource.reservation_id=appointment.reservation_id where appointment.customer_name='Combinada'),1,'combined components share reservation');
insert into admin_complementary_tap_results select throws_ok(format($$select public.create_admin_reservation(%L::jsonb)$$,jsonb_build_object('customer_name','Inativa','customer_whatsapp','53999990005','complementary',jsonb_build_object('option_id','b7300000-0000-4000-8000-000000000003','occupancy_mode','day','date',current_date+23))),'22023','reservation_complementary_option_invalid','inactive option is rejected');
insert into admin_complementary_tap_results select is((select count(*)::integer from public.reservations where customer_name='Inativa'),0,'invalid option leaves no partial reservation');
insert into admin_complementary_tap_results select throws_ok(format($$select public.create_admin_reservation(%L::jsonb)$$,jsonb_build_object('customer_name','Tenant','customer_whatsapp','53999990006','complementary',jsonb_build_object('option_id','b7300000-0000-4000-8000-000000000004','occupancy_mode','day','date',current_date+24))),'22023','reservation_complementary_option_invalid','cross-tenant option is rejected');
insert into admin_complementary_tap_results select is((select count(*)::integer from jsonb_array_elements(public.get_admin_complementary_availability(current_date+25,null,null)->'options')),1,'Admin day availability ignores closed-day hours and excludes inactive options');

select set_config('request.jwt.claims','{"sub":"b7000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
insert into admin_complementary_tap_results select lives_ok(format($$select public.create_admin_reservation(%L::jsonb)$$,jsonb_build_object('customer_name','Fora Horário','customer_whatsapp','53999990007','complementary',jsonb_build_object('option_id','b7300000-0000-4000-8000-000000000004','occupancy_mode','time_slot','date',current_date+25,'start_time','23:00','end_time','23:30'))),'time-slot Admin reservation works outside hours');
insert into admin_complementary_tap_results select is((select count(*)::integer from public.resource_allocations where option_id='b7300000-0000-4000-8000-000000000004' and start_time='23:00'),1,'time-slot allocation is created');
insert into admin_complementary_tap_results select throws_ok(format($$select public.create_admin_reservation(%L::jsonb)$$,jsonb_build_object('customer_name','Slot Conflito','customer_whatsapp','53999990008','complementary',jsonb_build_object('option_id','b7300000-0000-4000-8000-000000000004','occupancy_mode','time_slot','date',current_date+25,'start_time','23:15','end_time','23:45'))),'23P01','reservation_complementary_conflict','time-slot overlap is rejected');
insert into admin_complementary_tap_results select is((select count(*)::integer from public.reservations where customer_name='Slot Conflito'),0,'conflicting time-slot leaves no partial reservation');

reset role;
insert into admin_complementary_tap_results select * from finish();
select result from admin_complementary_tap_results;
rollback;
