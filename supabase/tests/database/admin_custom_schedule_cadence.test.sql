begin;
create extension if not exists pgtap with schema extensions;
create temporary table admin_cadence_results (line text);
grant all on table admin_cadence_results to authenticated;
insert into admin_cadence_results select plan(10);

create function pg_temp.next_monday() returns date language sql stable as $$
  select current_date + case when extract(dow from current_date)::integer=1 then 7 else (8-extract(dow from current_date)::integer)%7 end
$$;

insert into auth.users(id,email,raw_user_meta_data) values
 ('fa000000-0000-4000-8000-000000000001','custom-owner@example.test','{"name":"Owner"}'),
 ('fa000000-0000-4000-8000-000000000002','custom-admin@example.test','{"name":"Admin"}'),
 ('fa000000-0000-4000-8000-000000000003','custom-outsider@example.test','{"name":"Outsider"}');
insert into public.businesses(id,name,slug) values
 ('fa100000-0000-4000-8000-000000000001','Custom Hours','custom-hours'),
 ('fa100000-0000-4000-8000-000000000002','Other Tenant','other-hours');
insert into public.business_members(business_id,user_id,role) values
 ('fa100000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000001','owner'),
 ('fa100000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000002','admin'),
 ('fa100000-0000-4000-8000-000000000002','fa000000-0000-4000-8000-000000000003','owner');
insert into public.business_settings(business_id,duration_mode,fixed_duration_minutes,allow_multiple_blocks) values
 ('fa100000-0000-4000-8000-000000000001','fixed',60,false),
 ('fa100000-0000-4000-8000-000000000002','fixed',60,false);
insert into public.booking_groups(id,business_id,position,label,active,required,sort_order) values
 ('fa200000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000001',1,'Quadra',true,true,1),
 ('fa200000-0000-4000-8000-000000000002','fa100000-0000-4000-8000-000000000001',2,'Esporte',false,true,2),
 ('fa200000-0000-4000-8000-000000000003','fa100000-0000-4000-8000-000000000002',1,'Recurso',true,true,1);
insert into public.booking_options(id,business_id,group_id,name,duration_minutes,active,sort_order) values
 ('fa300000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000001','fa200000-0000-4000-8000-000000000001','Quadra 1',null,true,1),
 ('fa300000-0000-4000-8000-000000000002','fa100000-0000-4000-8000-000000000001','fa200000-0000-4000-8000-000000000001','Quadra 2',null,true,2),
 ('fa300000-0000-4000-8000-000000000003','fa100000-0000-4000-8000-000000000001','fa200000-0000-4000-8000-000000000002','90 minutos',90,true,1),
 ('fa300000-0000-4000-8000-000000000004','fa100000-0000-4000-8000-000000000002','fa200000-0000-4000-8000-000000000003','Outro',null,true,1);
insert into public.business_hours(business_id,weekday,active,start_time,end_time) values
 ('fa100000-0000-4000-8000-000000000001',1,true,'17:00','23:00');


update public.booking_options set schedule_mode='custom'
where id='fa300000-0000-4000-8000-000000000002';
insert into public.booking_option_hours(business_id,option_id,weekday,start_time,end_time)
values ('fa100000-0000-4000-8000-000000000001','fa300000-0000-4000-8000-000000000002',1,'18:15','23:15');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"fa000000-0000-4000-8000-000000000001","role":"authenticated"}',true);

insert into admin_cadence_results select results_eq(
 $$select slot->>'start_time' from jsonb_array_elements(public.get_admin_booking_availability(pg_temp.next_monday(),'fa300000-0000-4000-8000-000000000001',null)) slot$$,
 $$select to_char(time '00:00'+make_interval(hours=>hour),'HH24:MI') from generate_series(0,23) hour$$,
 'business option keeps the full-day legacy hourly grid');
insert into admin_cadence_results select results_eq(
 $$select slot->>'start_time' from jsonb_array_elements(public.get_admin_booking_availability(pg_temp.next_monday(),'fa300000-0000-4000-8000-000000000002',null)) slot$$,
 $$select to_char(time '00:15'+make_interval(hours=>hour),'HH24:MI') from generate_series(0,23) hour$$,
 'custom Admin grid includes overnight 23:15 without mixed whole hours');
insert into admin_cadence_results select results_eq(
 $$select slot->>'start_time' from jsonb_array_elements(public.get_booking_availability('custom-hours',pg_temp.next_monday(),'fa300000-0000-4000-8000-000000000002',null)) slot$$,
 array['18:15','19:15','20:15','21:15','22:15'],
 'public availability remains limited to the custom window');
insert into admin_cadence_results select lives_ok(format(
 $$select public.create_admin_appointment('fa300000-0000-4000-8000-000000000002',null,%L,'09:15',1,'Outside Cadence','5553999990010')$$,pg_temp.next_monday()),
 'Admin creates outside the public window on the custom cadence');
insert into admin_cadence_results select throws_ok(format(
 $$select public.create_admin_appointment('fa300000-0000-4000-8000-000000000002',null,%L,'09:15',1,'Conflict Cadence','5553999990011')$$,pg_temp.next_monday()),
 '23P01','booking_conflict','outside-hours appointments still conflict');
insert into admin_cadence_results select is(
 jsonb_array_length(public.get_admin_booking_availability(pg_temp.next_monday()+1,'fa300000-0000-4000-8000-000000000002',null)),
 24,'custom closed day retains full-day Admin booking');

reset role;
insert into public.appointments(id,business_id,group_1_option_id,customer_name,customer_whatsapp,appointment_date,start_time,end_time,duration_minutes)
values ('fa400000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000001','fa300000-0000-4000-8000-000000000002','Historical Phase','5553999990012',pg_temp.next_monday()+7,'09:30','10:30',60);
set local role authenticated;
insert into admin_cadence_results select is(
 (select count(*)::integer from jsonb_array_elements(public.get_admin_appointment_edit_availability('fa400000-0000-4000-8000-000000000001',pg_temp.next_monday()+7,'fa300000-0000-4000-8000-000000000002',null)) slot where slot->>'start_time'='09:30'),
 1,'editing retains the saved time outside the new cadence');
insert into admin_cadence_results select lives_ok(format(
 $$select public.create_calendar_blocks(array['fa300000-0000-4000-8000-000000000002'::uuid],%L,'19:15','20:15','Cadence block',false,null)$$,pg_temp.next_monday()),
 'calendar block can be created on the custom cadence');
insert into admin_cadence_results select is(
 (select count(*)::integer from jsonb_array_elements(public.get_admin_booking_availability(pg_temp.next_monday(),'fa300000-0000-4000-8000-000000000002',null)) slot where slot->>'start_time'='19:15'),
 0,'calendar block still removes the Admin slot');
reset role;
insert into public.booking_option_hours(business_id,option_id,weekday,start_time,end_time)
values ('fa100000-0000-4000-8000-000000000001','fa300000-0000-4000-8000-000000000002',1,'08:15','11:15');
set local role authenticated;
insert into admin_cadence_results select is(
 (select count(*)::integer from jsonb_array_elements(public.get_admin_booking_availability(pg_temp.next_monday()+14,'fa300000-0000-4000-8000-000000000002',null)) slot),
 24,'multiple windows with the same phase do not duplicate the daily grid');
reset role;
insert into admin_cadence_results select * from finish();
select line from admin_cadence_results;
rollback;
