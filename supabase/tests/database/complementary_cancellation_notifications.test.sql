begin;
create extension if not exists pgtap with schema extensions;
create temp table complementary_cancel_tap_results(result text);
grant insert,select on complementary_cancel_tap_results to anon,authenticated;
insert into complementary_cancel_tap_results select plan(33);

insert into auth.users(id,email) values
('c9000000-0000-4000-8000-000000000001','cancel-owner@test.local'),
('c9000000-0000-4000-8000-000000000002','cancel-other@test.local'),
('c9000000-0000-4000-8000-000000000003','cancel-none@test.local');
insert into public.businesses(id,name,slug,active) values
('c9100000-0000-4000-8000-000000000001','Cancel Business','cancel-business',true),
('c9100000-0000-4000-8000-000000000002','Other Business','cancel-other',true);
insert into public.business_members(business_id,user_id,role) values
('c9100000-0000-4000-8000-000000000001','c9000000-0000-4000-8000-000000000001','owner'),
('c9100000-0000-4000-8000-000000000002','c9000000-0000-4000-8000-000000000002','owner');
insert into public.business_settings(business_id,duration_mode,fixed_duration_minutes,allow_multiple_blocks) values
('c9100000-0000-4000-8000-000000000001','fixed',60,false),('c9100000-0000-4000-8000-000000000002','fixed',60,false);
insert into public.booking_groups(id,business_id,position,label,intent_name,occupancy_mode,active,required,sort_order) values
('c9200000-0000-4000-8000-000000000001','c9100000-0000-4000-8000-000000000001',1,'Quadra',null,null,true,true,1),
('c9200000-0000-4000-8000-000000000002','c9100000-0000-4000-8000-000000000001',3,'Espaço','Espaço','day',true,false,3),
('c9200000-0000-4000-8000-000000000003','c9100000-0000-4000-8000-000000000002',3,'Outro','Outro','day',true,false,3);
insert into public.booking_options(id,business_id,group_id,name,active,sort_order) values
('c9300000-0000-4000-8000-000000000001','c9100000-0000-4000-8000-000000000001','c9200000-0000-4000-8000-000000000001','Quadra 1',true,1),
('c9300000-0000-4000-8000-000000000002','c9100000-0000-4000-8000-000000000001','c9200000-0000-4000-8000-000000000002','Churrasqueira 2',true,1),
('c9300000-0000-4000-8000-000000000003','c9100000-0000-4000-8000-000000000002','c9200000-0000-4000-8000-000000000003','Outro recurso',true,1);
insert into public.business_hours(business_id,weekday,active,start_time,end_time)
select 'c9100000-0000-4000-8000-000000000001', day, true, '08:00','20:00' from generate_series(0,6) day;

-- Public notification matrix.
set local role anon;
select public.create_public_reservation('cancel-business',jsonb_build_object('customer_name','Public Primary','customer_whatsapp','53999990001','primary',jsonb_build_object('group_1_option_id','c9300000-0000-4000-8000-000000000001','group_2_option_id',null,'date',current_date+30,'start_time','10:00','blocks',1)));
select public.create_public_reservation('cancel-business',jsonb_build_object('customer_name','Public Complement','customer_whatsapp','53999990002','complementary',jsonb_build_object('option_id','c9300000-0000-4000-8000-000000000002','occupancy_mode','day','date',current_date+31)));
select public.create_public_reservation('cancel-business',jsonb_build_object('customer_name','Public Combined','customer_whatsapp','53999990003','primary',jsonb_build_object('group_1_option_id','c9300000-0000-4000-8000-000000000001','group_2_option_id',null,'date',current_date+32,'start_time','11:00','blocks',1),'complementary',jsonb_build_object('option_id','c9300000-0000-4000-8000-000000000002','occupancy_mode','day','date',current_date+32)));
reset role;
insert into complementary_cancel_tap_results select is((select count(*)::integer from public.admin_notifications n join public.appointments a on a.id=n.appointment_id where a.customer_name='Public Primary'),1,'public primary-only keeps one notification');
insert into complementary_cancel_tap_results select is((select count(*)::integer from public.admin_notifications n join public.appointments a on a.id=n.appointment_id where a.customer_name='Public Combined'),1,'public combined keeps one notification');
insert into complementary_cancel_tap_results select is((select count(*)::integer from public.admin_notifications n join public.reservation_resources rr on rr.id=n.reservation_resource_id join public.reservations r on r.id=rr.reservation_id where r.customer_name='Public Complement'),1,'public complementary-only creates one notification');
insert into complementary_cancel_tap_results select matches((select message from public.admin_notifications where reservation_resource_id is not null limit 1),'Churrasqueira 2.*Reserva do dia','day notification contains the resource and occupancy description');
insert into complementary_cancel_tap_results select is((select count(*)::integer from public.appointments where customer_name='Public Complement'),0,'complementary-only notification does not require a fake appointment');
insert into complementary_cancel_tap_results select is((select count(*)::integer from public.admin_notifications where business_id='c9100000-0000-4000-8000-000000000002'),0,'another tenant receives no notification');

-- Admin cancellation setup and authorization.
set local role anon;
insert into complementary_cancel_tap_results select throws_ok($$select public.cancel_admin_reservation_resource(gen_random_uuid())$$,'42501','permission denied for function cancel_admin_reservation_resource','anon cannot cancel a component');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c9000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.create_admin_reservation(jsonb_build_object('customer_name','Admin Day','customer_whatsapp','53999990101','complementary',jsonb_build_object('option_id','c9300000-0000-4000-8000-000000000002','occupancy_mode','day','date',current_date+40)));
select public.create_admin_reservation(jsonb_build_object('customer_name','Admin Slot','customer_whatsapp','53999990102','complementary',jsonb_build_object('option_id','c9300000-0000-4000-8000-000000000002','occupancy_mode','day','date',current_date+41)));
select public.create_admin_reservation(jsonb_build_object('customer_name','Admin Combined','customer_whatsapp','53999990103','primary',jsonb_build_object('group_1_option_id','c9300000-0000-4000-8000-000000000001','group_2_option_id',null,'date',current_date+42,'start_time','22:00','blocks',1),'complementary',jsonb_build_object('option_id','c9300000-0000-4000-8000-000000000002','occupancy_mode','day','date',current_date+42)));

insert into complementary_cancel_tap_results select lives_ok(format('select public.cancel_admin_reservation_resource(%L)',(select rr.id from public.reservation_resources rr join public.reservations r on r.id=rr.reservation_id where r.customer_name='Admin Day')),'owner cancels complementary-only day');
insert into complementary_cancel_tap_results select is((select status::text from public.reservation_resources rr join public.reservations r on r.id=rr.reservation_id where r.customer_name='Admin Day'),'cancelled','day component keeps cancelled history');
insert into complementary_cancel_tap_results select is((select active from public.resource_allocations ra join public.reservation_resources rr on rr.id=ra.reservation_resource_id join public.reservations r on r.id=rr.reservation_id where r.customer_name='Admin Day'),false,'day allocation is inactive');
insert into complementary_cancel_tap_results select is((public.get_admin_complementary_availability(current_date+40,null,null)->'options'->0->>'available')::boolean,true,'day resource becomes available again');
insert into complementary_cancel_tap_results select lives_ok(format('select public.cancel_admin_reservation_resource(%L)',(select rr.id from public.reservation_resources rr join public.reservations r on r.id=rr.reservation_id where r.customer_name='Admin Day')),'repeated cancellation is idempotent');

update public.booking_groups set occupancy_mode='time_slot' where id='c9200000-0000-4000-8000-000000000002';
select public.create_admin_reservation(jsonb_build_object('customer_name','Admin Time Slot','customer_whatsapp','53999990105','complementary',jsonb_build_object('option_id','c9300000-0000-4000-8000-000000000002','occupancy_mode','time_slot','date',current_date+44,'start_time','14:00','end_time','16:00')));
insert into complementary_cancel_tap_results select lives_ok(format('select public.cancel_admin_reservation_resource(%L)',(select rr.id from public.reservation_resources rr join public.reservations r on r.id=rr.reservation_id where r.customer_name='Admin Time Slot')),'owner cancels complementary-only time slot');
insert into complementary_cancel_tap_results select is((select status::text from public.reservation_resources rr join public.reservations r on r.id=rr.reservation_id where r.customer_name='Admin Time Slot'),'cancelled','time-slot component keeps cancelled history');
insert into complementary_cancel_tap_results select is((select active from public.resource_allocations ra join public.reservation_resources rr on rr.id=ra.reservation_resource_id join public.reservations r on r.id=rr.reservation_id where r.customer_name='Admin Time Slot'),false,'time-slot allocation is inactive');
insert into complementary_cancel_tap_results select is((public.get_admin_complementary_availability(current_date+44,'14:00','16:00')->'options'->0->>'available')::boolean,true,'time-slot interval becomes available again');
update public.booking_groups set occupancy_mode='day' where id='c9200000-0000-4000-8000-000000000002';

insert into complementary_cancel_tap_results select lives_ok(format('select public.cancel_admin_reservation_resource(%L)',(select rr.id from public.reservation_resources rr join public.reservations r on r.id=rr.reservation_id where r.customer_name='Admin Combined')),'combined complementary component can be cancelled separately');
insert into complementary_cancel_tap_results select is((select status::text from public.appointments where customer_name='Admin Combined'),'scheduled','primary remains scheduled after complementary cancellation');

-- A separate combined aggregate proves principal-only and full cancellation.
select public.create_admin_reservation(jsonb_build_object('customer_name','Admin Principal Only','customer_whatsapp','53999990104','primary',jsonb_build_object('group_1_option_id','c9300000-0000-4000-8000-000000000001','group_2_option_id',null,'date',current_date+43,'start_time','22:00','blocks',1),'complementary',jsonb_build_object('option_id','c9300000-0000-4000-8000-000000000002','occupancy_mode','day','date',current_date+43)));
select public.set_appointment_status((select id from public.appointments where customer_name='Admin Principal Only'),'cancelled');
insert into complementary_cancel_tap_results select is((select status::text from public.reservation_resources rr join public.reservations r on r.id=rr.reservation_id where r.customer_name='Admin Principal Only'),'scheduled','principal-only cancellation preserves complementary component');
select public.create_admin_reservation(jsonb_build_object('customer_name','Admin Combined Full','customer_whatsapp','53999990106','primary',jsonb_build_object('group_1_option_id','c9300000-0000-4000-8000-000000000001','group_2_option_id',null,'date',current_date+45,'start_time','22:00','blocks',1),'complementary',jsonb_build_object('option_id','c9300000-0000-4000-8000-000000000002','occupancy_mode','day','date',current_date+45)));
insert into complementary_cancel_tap_results select lives_ok(format('select public.cancel_admin_reservation(%L)',(select id from public.reservations where customer_name='Admin Combined Full')),'complete combined cancellation succeeds');
insert into complementary_cancel_tap_results select is((select status::text from public.appointments where customer_name='Admin Combined Full'),'cancelled','complete cancellation cancels primary');
insert into complementary_cancel_tap_results select is((select status::text from public.reservation_resources rr join public.reservations r on r.id=rr.reservation_id where r.customer_name='Admin Combined Full'),'cancelled','complete cancellation cancels complementary');
insert into complementary_cancel_tap_results select is((select active from public.resource_allocations ra join public.reservation_resources rr on rr.id=ra.reservation_resource_id join public.reservations r on r.id=rr.reservation_id where r.customer_name='Admin Combined Full'),false,'complete cancellation releases allocation');
insert into complementary_cancel_tap_results select lives_ok(format('select public.cancel_admin_reservation(%L)',(select id from public.reservations where customer_name='Admin Combined Full')),'complete cancellation is idempotent');

-- A missing allocation makes the resource trigger fail and proves the aggregate update rolls back.
select public.create_admin_reservation(jsonb_build_object('customer_name','Admin Rollback','customer_whatsapp','53999990107','primary',jsonb_build_object('group_1_option_id','c9300000-0000-4000-8000-000000000001','group_2_option_id',null,'date',current_date+46,'start_time','22:00','blocks',1),'complementary',jsonb_build_object('option_id','c9300000-0000-4000-8000-000000000002','occupancy_mode','day','date',current_date+46)));
reset role;
delete from public.resource_allocations where reservation_resource_id=(select rr.id from public.reservation_resources rr join public.reservations r on r.id=rr.reservation_id where r.customer_name='Admin Rollback');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c9000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into complementary_cancel_tap_results select throws_ok(format('select public.cancel_admin_reservation(%L)',(select id from public.reservations where customer_name='Admin Rollback')),'23503','reservation_resource_allocation_missing','complete cancellation reports a component failure');
insert into complementary_cancel_tap_results select is((select status::text from public.appointments where customer_name='Admin Rollback'),'scheduled','failed complete cancellation rolls back the primary status');
insert into complementary_cancel_tap_results select is((select status::text from public.reservation_resources rr join public.reservations r on r.id=rr.reservation_id where r.customer_name='Admin Rollback'),'scheduled','failed complete cancellation preserves the complementary status');

select set_config('request.jwt.claims','{"sub":"c9000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
insert into complementary_cancel_tap_results select throws_ok(format('select public.cancel_admin_reservation_resource(%L)',(select rr.id from public.reservation_resources rr join public.reservations r on r.id=rr.reservation_id where r.customer_name='Admin Slot')),'42501','reservation_resource_not_found','another tenant cannot cancel a component');
select set_config('request.jwt.claims','{"sub":"c9000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
insert into complementary_cancel_tap_results select throws_ok(format('select public.cancel_admin_reservation(%L)',(select id from public.reservations where customer_name='Admin Slot')),'42501','reservation_not_found','user without membership cannot cancel aggregate');
reset role;
insert into complementary_cancel_tap_results select is((select count(*)::integer from public.resource_allocations where reservation_resource_id is null and resource_block_id is null),0,'no orphan allocation is created');
insert into complementary_cancel_tap_results select is((select count(*)::integer from public.admin_notifications where appointment_id is not null and reservation_resource_id is not null),0,'notification origins remain exclusive');
insert into complementary_cancel_tap_results select is((select count(*)::integer from public.admin_notifications n join public.reservations r on r.customer_name like 'Admin %' where n.reservation_resource_id in (select id from public.reservation_resources where reservation_id=r.id)),0,'Admin manual reservations create no complementary notification');
insert into complementary_cancel_tap_results select is((select count(*)::integer from public.resource_blocks where business_id='c9100000-0000-4000-8000-000000000001' and not active),0,'reservation cancellation does not affect resource blocks');

insert into complementary_cancel_tap_results select * from finish();
select result from complementary_cancel_tap_results;
rollback;
