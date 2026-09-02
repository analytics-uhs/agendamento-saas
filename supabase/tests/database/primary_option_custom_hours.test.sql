begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

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

select is((select schedule_mode::text from public.booking_options where id='fa300000-0000-4000-8000-000000000001'),'business','legacy option defaults to business schedule');
select is((select count(*)::integer from information_schema.role_table_grants where table_schema='public' and table_name='booking_option_hours' and grantee='service_role'),0,'service role has no unnecessary direct table grants');
select is(public.get_booking_availability('missing-custom-hours',current_date+30,null,null),'[]'::jsonb,'unknown slug preserves the legacy empty availability contract');
select results_eq($$select slot->>'start_time' from jsonb_array_elements(public.get_booking_availability('custom-hours',pg_temp.next_monday(),'fa300000-0000-4000-8000-000000000001',null)) slot$$,
 array['17:00','18:00','19:00','20:00','21:00','22:00'],'business option keeps legacy anchored slots');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"fa000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select public.set_admin_booking_option_schedule('fa300000-0000-4000-8000-000000000002','custom','[
 {"weekday":0,"windows":[]},{"weekday":1,"windows":[{"start_time":"18:15","end_time":"23:15"}]},{"weekday":2,"windows":[]},
 {"weekday":3,"windows":[{"start_time":"08:15","end_time":"11:15"},{"start_time":"14:15","end_time":"18:15"}]},
 {"weekday":4,"windows":[]},{"weekday":5,"windows":[]},{"weekday":6,"windows":[]}]')$$,'owner configures custom windows atomically');
select is((select schedule_mode::text from public.booking_options where id='fa300000-0000-4000-8000-000000000002'),'custom','custom mode is explicit');
select throws_ok($$insert into public.booking_option_hours(business_id,option_id,weekday,start_time,end_time) values('fa100000-0000-4000-8000-000000000001','fa300000-0000-4000-8000-000000000002',1,'20:00','21:00')$$,'42501',null,'authenticated browser has no direct insert grant');

select set_config('request.jwt.claims','{"sub":"fa000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok($$select public.set_admin_booking_option_schedule('fa300000-0000-4000-8000-000000000002','business',null)$$,'42501','booking_option_schedule_forbidden','other tenant cannot edit schedule');

reset role;
select results_eq($$select slot->>'start_time' from jsonb_array_elements(public.get_booking_availability('custom-hours',pg_temp.next_monday(),'fa300000-0000-4000-8000-000000000002',null)) slot$$,
 array['18:15','19:15','20:15','21:15','22:15'],'custom slots preserve the 18:15 anchor');
select is((select jsonb_array_length(public.get_booking_availability('custom-hours',pg_temp.next_monday()+1,'fa300000-0000-4000-8000-000000000002',null))),0,'custom closed day never falls back to business hours');
select results_eq($$select slot->>'start_time' from jsonb_array_elements(public.get_booking_availability('custom-hours',pg_temp.next_monday()+2,'fa300000-0000-4000-8000-000000000002',null)) slot$$,
 array['08:15','09:15','10:15','14:15','15:15','16:15','17:15'],'multiple windows do not bridge the closed interval');

set local role anon; select set_config('request.jwt.claims','{"role":"anon"}',true);
select lives_ok(format($$select public.create_public_appointment('custom-hours','fa300000-0000-4000-8000-000000000002',null,%L,'18:15',1,'Valid Custom','5553999990001')$$,pg_temp.next_monday()),'valid custom appointment is created');
select throws_ok(format($$select public.create_public_appointment('custom-hours','fa300000-0000-4000-8000-000000000002',null,%L,'18:00',1,'Off Grid','5553999990002')$$,pg_temp.next_monday()),'22023','booking_outside_business_hours','off-grid public time is rejected');
select throws_ok(format($$select public.create_public_appointment('custom-hours','fa300000-0000-4000-8000-000000000002',null,%L,'17:15',1,'Before Open','5553999990003')$$,pg_temp.next_monday()),'22023','booking_outside_business_hours','time before custom opening is rejected');
select throws_ok(format($$select public.create_public_appointment('custom-hours','fa300000-0000-4000-8000-000000000002',null,%L,'22:45',1,'After Close','5553999990004')$$,pg_temp.next_monday()),'22023','booking_outside_business_hours','interval past custom closing is rejected');
select throws_ok(format($$select public.create_public_appointment('custom-hours','fa300000-0000-4000-8000-000000000002',null,%L,'18:15',1,'Conflict','5553999990005')$$,pg_temp.next_monday()),'23P01','booking_conflict','same primary resource still conflicts');
select lives_ok(format($$select public.create_public_appointment('custom-hours','fa300000-0000-4000-8000-000000000001',null,%L,'18:00',1,'Other Resource','5553999990006')$$,pg_temp.next_monday()),'different primary resources coexist');

reset role;
update public.business_settings set duration_mode='group_2' where business_id='fa100000-0000-4000-8000-000000000001';
update public.booking_groups set active=true where id='fa200000-0000-4000-8000-000000000002';
select results_eq($$select slot->>'start_time' from jsonb_array_elements(public.get_booking_availability('custom-hours',pg_temp.next_monday(),'fa300000-0000-4000-8000-000000000002','fa300000-0000-4000-8000-000000000003')) slot$$,
 array['19:45','21:15'],'group_2 duration fits and remains anchored at 18:15 after occupied interval');

update public.business_settings set duration_mode='fixed_multiple',fixed_duration_minutes=60,allow_multiple_blocks=true where business_id='fa100000-0000-4000-8000-000000000001';
update public.booking_groups set active=false where id='fa200000-0000-4000-8000-000000000002';
select is((select (slot->>'max_blocks')::integer from jsonb_array_elements(public.get_booking_availability('custom-hours',pg_temp.next_monday(),'fa300000-0000-4000-8000-000000000002',null)) slot where slot->>'start_time'='19:15'),4,'fixed multiple block count ends at custom closing');

set local role authenticated; select set_config('request.jwt.claims','{"sub":"fa000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select lives_ok($$select public.set_admin_booking_option_schedule('fa300000-0000-4000-8000-000000000002','business',null)$$,'admin can switch to business mode');
select is((select count(*)::integer from public.booking_option_hours where option_id='fa300000-0000-4000-8000-000000000002'),3,'switching to business preserves custom rows');
select results_eq($$select slot->>'start_time' from jsonb_array_elements(public.get_booking_availability('custom-hours',pg_temp.next_monday(),'fa300000-0000-4000-8000-000000000002',null)) slot$$,
 array['17:00','20:00','21:00','22:00'],'business mode ignores preserved custom rows while retaining ordinary conflict filtering');
select lives_ok(format($$select public.create_admin_appointment('fa300000-0000-4000-8000-000000000002',null,%L,'09:00',1,'Admin Outside','5553999990007')$$,pg_temp.next_monday()),'Admin creation remains allowed outside configured hours');

reset role;
select throws_ok($$update public.booking_options set schedule_mode='custom' where id='fa300000-0000-4000-8000-000000000003'$$,'23514','booking_option_custom_schedule_primary_only','secondary option cannot use custom schedule');
select throws_ok($$insert into public.booking_option_hours(business_id,option_id,weekday,start_time,end_time) values('fa100000-0000-4000-8000-000000000001','fa300000-0000-4000-8000-000000000002',1,'17:00','19:00')$$,'23P01',null,'overlapping custom windows are rejected');

set local role authenticated; select set_config('request.jwt.claims','{"sub":"fa000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select public.set_admin_booking_option_schedule('fa300000-0000-4000-8000-000000000002','custom','[
 {"weekday":0,"windows":[]},{"weekday":1,"windows":[{"start_time":"18:15","end_time":"00:00"}]},{"weekday":2,"windows":[]},
 {"weekday":3,"windows":[]},{"weekday":4,"windows":[]},{"weekday":5,"windows":[]},{"weekday":6,"windows":[]}]')$$,'custom midnight window is accepted');
select lives_ok(format($$select public.create_admin_appointment('fa300000-0000-4000-8000-000000000002',null,%L,'09:15',1,'Admin Outside Custom','5553999990008')$$,pg_temp.next_monday()+7),'Admin remains allowed outside a custom schedule');
reset role;
select is((select count(*)::integer from jsonb_array_elements(public.get_booking_availability('custom-hours',pg_temp.next_monday(),'fa300000-0000-4000-8000-000000000002',null)) slot where slot->>'start_time'='23:15'),0,'60-minute slot never crosses midnight');
select is((select count(*)::integer from jsonb_array_elements(public.get_booking_availability('custom-hours',pg_temp.next_monday(),'fa300000-0000-4000-8000-000000000002',null)) slot where slot->>'start_time'='22:15'),1,'custom midnight semantics preserve the anchored final fitting slot');
select is((select jsonb_array_length((public.get_public_booking_page('custom-hours')->'groups'->0->'options'->1->'available_weekdays'))),1,'public payload exposes only curated weekdays for custom option');

select * from finish();
rollback;
