begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create function pg_temp.next_monday() returns date language sql stable as $$
  select current_date + case when extract(dow from current_date)::integer=1 then 7 else (8-extract(dow from current_date)::integer)%7 end
$$;

insert into auth.users(id,email,raw_user_meta_data) values
 ('fb000000-0000-4000-8000-000000000001','custom-owner@example.test','{"name":"Owner"}'),
 ('fb000000-0000-4000-8000-000000000002','custom-admin@example.test','{"name":"Admin"}'),
 ('fb000000-0000-4000-8000-000000000003','custom-outsider@example.test','{"name":"Outsider"}');
insert into public.businesses(id,name,slug) values
 ('fb100000-0000-4000-8000-000000000001','Custom Hours','overnight-hours'),
 ('fb100000-0000-4000-8000-000000000002','Other Tenant','other-hours');
insert into public.business_members(business_id,user_id,role) values
 ('fb100000-0000-4000-8000-000000000001','fb000000-0000-4000-8000-000000000001','owner'),
 ('fb100000-0000-4000-8000-000000000001','fb000000-0000-4000-8000-000000000002','admin'),
 ('fb100000-0000-4000-8000-000000000002','fb000000-0000-4000-8000-000000000003','owner');
insert into public.business_settings(business_id,duration_mode,fixed_duration_minutes,allow_multiple_blocks) values
 ('fb100000-0000-4000-8000-000000000001','fixed',60,false),
 ('fb100000-0000-4000-8000-000000000002','fixed',60,false);
insert into public.booking_groups(id,business_id,position,label,active,required,sort_order) values
 ('fb200000-0000-4000-8000-000000000001','fb100000-0000-4000-8000-000000000001',1,'Quadra',true,true,1),
 ('fb200000-0000-4000-8000-000000000002','fb100000-0000-4000-8000-000000000001',2,'Esporte',false,true,2),
 ('fb200000-0000-4000-8000-000000000003','fb100000-0000-4000-8000-000000000002',1,'Recurso',true,true,1);
insert into public.booking_options(id,business_id,group_id,name,duration_minutes,active,sort_order) values
 ('fb300000-0000-4000-8000-000000000001','fb100000-0000-4000-8000-000000000001','fb200000-0000-4000-8000-000000000001','Quadra 1',null,true,1),
 ('fb300000-0000-4000-8000-000000000002','fb100000-0000-4000-8000-000000000001','fb200000-0000-4000-8000-000000000001','Quadra 2',null,true,2),
 ('fb300000-0000-4000-8000-000000000003','fb100000-0000-4000-8000-000000000001','fb200000-0000-4000-8000-000000000002','90 minutos',90,true,1),
 ('fb300000-0000-4000-8000-000000000004','fb100000-0000-4000-8000-000000000002','fb200000-0000-4000-8000-000000000003','Outro',null,true,1);
insert into public.business_hours(business_id,weekday,active,start_time,end_time) values
 ('fb100000-0000-4000-8000-000000000001',1,true,'23:15','02:15');


select is(private.booking_period(date '2030-01-07','23:15','00:00'),tsrange('2030-01-07 23:15','2030-01-08 00:00','[)'),'midnight keeps end-of-day semantics');
select is(private.booking_period(date '2030-01-07','23:15','00:15'),tsrange('2030-01-07 23:15','2030-01-08 00:15','[)'),'earlier end belongs to the next date');
select results_eq($$select slot->>'start_time' from jsonb_array_elements(public.get_booking_availability('overnight-hours',pg_temp.next_monday(),'fb300000-0000-4000-8000-000000000001',null)) slot$$,array['23:15'],'start date contains only starts on that date');
select results_eq($$select slot->>'start_time' from jsonb_array_elements(public.get_booking_availability('overnight-hours',pg_temp.next_monday()+1,'fb300000-0000-4000-8000-000000000001',null)) slot$$,array['00:15','01:15'],'spill slots belong to the next actual date with original anchor');
select throws_ok($$insert into public.business_hours(business_id,weekday,active,start_time,end_time) values('fb100000-0000-4000-8000-000000000001',2,true,'00:00','01:00')$$,'23P01',null,'adjacent weekdays cannot overlap');
select throws_ok($$insert into public.business_hours(business_id,weekday,active,start_time,end_time) values('fb100000-0000-4000-8000-000000000001',3,true,'23:15','23:15')$$,'23514',null,'zero duration rejected');

set local role anon;
select lives_ok(format($$select public.create_public_appointment('overnight-hours','fb300000-0000-4000-8000-000000000001',null,%L,'23:15',1,'Overnight Client','5553999991111')$$,pg_temp.next_monday()),'public creation crosses midnight');
reset role;
select is((select end_time::text from public.appointments where business_id='fb100000-0000-4000-8000-000000000001'),'00:15:00','appointment stores real next-day end time');
select throws_ok(format($$insert into public.appointments(business_id,group_1_option_id,customer_name,customer_whatsapp,appointment_date,start_time,end_time,duration_minutes) values('fb100000-0000-4000-8000-000000000001','fb300000-0000-4000-8000-000000000001','Conflicting Client','5553999991111',%L,'00:00','01:00',60)$$,pg_temp.next_monday()+1),'23P01',null,'GiST rejects overlap starting on next date');
select lives_ok(format($$select public.create_public_appointment('overnight-hours','fb300000-0000-4000-8000-000000000001',null,%L,'00:15',1,'Adjacent Client','5553999991111')$$,pg_temp.next_monday()+1),'adjacent next-date appointment is allowed');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"fb000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select public.set_admin_booking_option_schedule('fb300000-0000-4000-8000-000000000002','custom','[
 {"weekday":0,"windows":[]},{"weekday":1,"windows":[{"start_time":"23:15","end_time":"00:15"}]},
 {"weekday":2,"windows":[]},{"weekday":3,"windows":[]},{"weekday":4,"windows":[]},{"weekday":5,"windows":[]},{"weekday":6,"windows":[]}]')$$,'custom configuration accepts overnight');
select lives_ok(format($$select public.create_public_appointment('overnight-hours','fb300000-0000-4000-8000-000000000002',null,%L,'23:15',1,'Other Primary','5553999991111')$$,pg_temp.next_monday()),'different resources coexist overnight');
select lives_ok(format($$select public.create_admin_appointment('fb300000-0000-4000-8000-000000000002',null,%L,'22:15',1,'Admin Outside','5553999991111')$$,pg_temp.next_monday()),'Admin keeps outside-hours creation');
select lives_ok(format($$select public.create_calendar_blocks(array['fb300000-0000-4000-8000-000000000001'::uuid],%L,'23:30','00:30','Overnight block')$$,pg_temp.next_monday()+7),'calendar block can cross midnight');
reset role;
select throws_ok(format($$insert into public.appointments(business_id,group_1_option_id,customer_name,customer_whatsapp,appointment_date,start_time,end_time,duration_minutes) values('fb100000-0000-4000-8000-000000000001','fb300000-0000-4000-8000-000000000001','Blocked Client','5553999991111',%L,'00:15','01:15',60)$$,pg_temp.next_monday()+8),'23P01','booking_conflict','block rejects next-date appointment');
select is((select count(*)::integer from jsonb_array_elements(public.get_booking_availability('overnight-hours',pg_temp.next_monday()+8,'fb300000-0000-4000-8000-000000000001',null)) slot where slot->>'start_time'='00:15'),0,'block removes spill availability');

update public.business_settings set duration_mode='fixed_multiple',allow_multiple_blocks=true where business_id='fb100000-0000-4000-8000-000000000001';
select is((public.get_booking_availability('overnight-hours',pg_temp.next_monday()+14,'fb300000-0000-4000-8000-000000000001',null)->0->>'max_blocks')::integer,3,'multiple blocks may span midnight but not closing');
select lives_ok(format($$select public.create_public_appointment('overnight-hours','fb300000-0000-4000-8000-000000000001',null,%L,'23:15',3,'Three Blocks','5553999991111')$$,pg_temp.next_monday()+14),'three consecutive blocks cross midnight');
select throws_ok(format($$select public.create_public_appointment('overnight-hours','fb300000-0000-4000-8000-000000000001',null,%L,'23:15',4,'Too Long','5553999991111')$$,pg_temp.next_monday()+21),'22023','booking_outside_business_hours','multiple blocks cannot exceed closing');

update public.business_settings set duration_mode='group_2',allow_multiple_blocks=false where business_id='fb100000-0000-4000-8000-000000000001';
update public.booking_groups set active=true where id='fb200000-0000-4000-8000-000000000002';
select results_eq($$select slot->>'start_time' from jsonb_array_elements(public.get_booking_availability('overnight-hours',pg_temp.next_monday()+21,'fb300000-0000-4000-8000-000000000001','fb300000-0000-4000-8000-000000000003')) slot$$,array['23:15'],'90-minute duration crosses midnight');
select results_eq($$select slot->>'start_time' from jsonb_array_elements(public.get_booking_availability('overnight-hours',pg_temp.next_monday()+22,'fb300000-0000-4000-8000-000000000001','fb300000-0000-4000-8000-000000000003')) slot$$,array['00:45'],'secondary duration preserves yesterday anchor');

update public.business_settings set duration_mode='fixed',fixed_duration_minutes=60,allow_multiple_blocks=false where business_id='fb100000-0000-4000-8000-000000000001';
update public.booking_groups set active=false where id='fb200000-0000-4000-8000-000000000002';
set local role authenticated;
select lives_ok(format($$select public.create_recurring_appointment_series('fb300000-0000-4000-8000-000000000002',null,%L,'23:15',1,'Recurring Overnight','5553999991111',2)$$,pg_temp.next_monday()+21),'recurring series materializes overnight occurrences');
reset role;
select is((select count(*)::integer from public.appointments where customer_name='Recurring Overnight' and end_time='00:15'),2,'both recurring occurrences preserve next-day end');

insert into public.booking_groups(id,business_id,position,label,active,occupancy_mode) values
 ('fb200000-0000-4000-8000-000000000005','fb100000-0000-4000-8000-000000000001',3,'Complemento',true,'time_slot');
insert into public.booking_options(id,business_id,group_id,name) values
 ('fb300000-0000-4000-8000-000000000005','fb100000-0000-4000-8000-000000000001','fb200000-0000-4000-8000-000000000005','Opção complementar');
set local role anon;
select lives_ok(format($$select public.create_public_reservation('overnight-hours',jsonb_build_object('customer_name','Complementary Client','customer_whatsapp','5553999991111','complementary',jsonb_build_object('option_id','fb300000-0000-4000-8000-000000000005','occupancy_mode','time_slot','date',%L,'start_time','23:15','end_time','00:15')))$$,pg_temp.next_monday()),'public complementary overnight reservation');
reset role;
select is((select upper(occupied_period)::date-allocation_date from public.resource_allocations where business_id='fb100000-0000-4000-8000-000000000001'),1,'allocation occupies next calendar date');
set local role authenticated;
select lives_ok(format($$select public.create_admin_resource_blocks(array['fb300000-0000-4000-8000-000000000005'::uuid],%L,'23:30','00:30','Complementary overnight')$$,pg_temp.next_monday()+7),'complementary block crosses midnight');
select throws_ok(format($$select public.create_admin_reservation(jsonb_build_object('customer_name','Blocked Complement','customer_whatsapp','5553999991111','complementary',jsonb_build_object('option_id','fb300000-0000-4000-8000-000000000005','occupancy_mode','time_slot','date',%L,'start_time','00:00','end_time','01:00')))$$,pg_temp.next_monday()+8),'23P01','reservation_complementary_conflict','next-date complementary conflict respects allocation');

select lives_ok(format($$select public.update_admin_appointment_occurrence((select id from public.appointments where customer_name='Admin Outside'),'fb300000-0000-4000-8000-000000000002',null,%L,'23:15',1,'Edited Overnight','5553999991111')$$,pg_temp.next_monday()+35),'Admin editing accepts overnight interval');
select is((select end_time::text from public.appointments where customer_name='Edited Overnight'),'00:15:00','Admin edit stores next-day ending');
select lives_ok(format($$select public.create_admin_reservation(jsonb_build_object('customer_name','Combined Overnight','customer_whatsapp','5553999991111','primary',jsonb_build_object('group_1_option_id','fb300000-0000-4000-8000-000000000001','date',%L,'start_time','23:15','blocks',1),'complementary',jsonb_build_object('option_id','fb300000-0000-4000-8000-000000000005','occupancy_mode','time_slot','date',%L,'start_time','23:15','end_time','00:15')))$$,pg_temp.next_monday()+42,pg_temp.next_monday()+42),'combined overnight reservation remains atomic');
reset role;
select is((select jsonb_array_length(option->'available_weekdays') from jsonb_array_elements(public.get_public_booking_page('overnight-hours')->'groups') g cross join lateral jsonb_array_elements(g->'options') option where option->>'id'='fb300000-0000-4000-8000-000000000002'),2,'curated weekdays include custom spill into next day');
select is(private.complementary_period('day',date '2030-01-08'),tsrange('2030-01-08 00:00','2030-01-09 00:00','[)'),'day keeps exactly one civil day');
select ok(private.complementary_period('day',date '2030-01-08') && private.complementary_period('time_slot',date '2030-01-07','23:15','00:15'),'day allocation conflicts with prior overnight spill');
select * from finish();
rollback;
