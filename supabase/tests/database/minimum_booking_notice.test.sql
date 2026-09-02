begin;
create extension if not exists pgtap with schema extensions;
create temporary table notice_results(result text);
insert into notice_results select no_plan();
create temporary table notice_clock(instant timestamptz);
insert into notice_clock values ((current_date+30+time '18:00') at time zone 'America/Sao_Paulo');
-- Privileged, transaction-local test replacement; rollback restores production
-- clock. No API parameter/GUC can override the production source of time.
create or replace function private.booking_notice_now() returns timestamptz
language sql stable set search_path='' as $$ select instant from pg_temp.notice_clock $$;
insert into auth.users(id,email) values ('be010000-0000-4000-8000-000000000001','notice-owner@example.test');
insert into public.businesses(id,name,slug) values ('be020000-0000-4000-8000-000000000001','Notice Test','notice-test');
insert into public.business_members(business_id,user_id,role) values ('be020000-0000-4000-8000-000000000001','be010000-0000-4000-8000-000000000001','owner');
insert into public.business_settings(business_id,duration_mode,fixed_duration_minutes) values ('be020000-0000-4000-8000-000000000001','fixed',60);
insert into public.business_hours(business_id,weekday,active,start_time,end_time)
select 'be020000-0000-4000-8000-000000000001',day,true,'18:15','00:15' from generate_series(0,6) day;
create function pg_temp.notice_valid(p_start time) returns boolean language sql as $$
 select private.public_booking_notice_is_valid('be020000-0000-4000-8000-000000000001',current_date+30,p_start)
$$;
create function pg_temp.notice_slots(p_date date) returns text[] language sql as $$
 select array(select slot->>'start_time' from jsonb_array_elements(public.get_booking_availability('notice-test',p_date,null,null)) slot)
$$;
insert into notice_results select is((select minimum_booking_notice_minutes from public.business_settings where business_id='be020000-0000-4000-8000-000000000001'),60,'default 60 for business settings');
insert into notice_results select ok(pg_temp.notice_valid('19:00'),'exact 60-minute boundary accepted');
update notice_clock set instant=instant+interval '1 minute';
insert into notice_results select ok(not pg_temp.notice_valid('19:00'),'59 minutes rejected');
insert into notice_results select ok(pg_temp.notice_valid('19:15'),'74 minutes accepted');
update notice_clock set instant=instant+interval '19 minutes';
insert into notice_results select ok(not pg_temp.notice_valid('19:15'),'18:20 excludes 19:15');
insert into notice_results select ok(pg_temp.notice_valid('20:15'),'18:20 accepts 20:15');
insert into notice_results select is(pg_temp.notice_slots(current_date+30),array['20:15','21:15','22:15','23:15'],'public RPC filters notice, preserves anchors and cross-midnight end');
insert into notice_results select is(pg_temp.notice_slots(current_date+31),array['18:15','19:15','20:15','21:15','22:15','23:15'],'tomorrow retains ordinary availability');
update public.business_settings set minimum_booking_notice_minutes=0 where business_id='be020000-0000-4000-8000-000000000001';
insert into notice_results select ok(pg_temp.notice_valid('18:20'),'zero accepts current instant');
update public.business_settings set minimum_booking_notice_minutes=30 where business_id='be020000-0000-4000-8000-000000000001';
insert into notice_results select ok(pg_temp.notice_valid('19:00'),'30 minutes accepts 40-minute lead');
update public.business_settings set minimum_booking_notice_minutes=120 where business_id='be020000-0000-4000-8000-000000000001';
insert into notice_results select ok(not pg_temp.notice_valid('20:15'),'120 minutes rejects 115-minute lead');
update public.business_settings set minimum_booking_notice_minutes=60 where business_id='be020000-0000-4000-8000-000000000001';
grant insert,select on notice_results to anon,authenticated;
set local role anon;
insert into notice_results select throws_ok(format($$select public.create_public_appointment('notice-test',null,null,%L,'19:15',1,'Too Soon','53999999999')$$,current_date+30),'22023','booking_minimum_notice','direct public creation cannot bypass notice');
insert into notice_results select throws_ok($$update public.business_settings set minimum_booking_notice_minutes=0$$,'42501',null,'anon cannot disable the rule');
insert into notice_results select throws_ok($$select private.booking_notice_now()$$,'42501',null,'anon cannot access private clock');
reset role;
update public.business_settings set duration_mode='fixed_multiple',allow_multiple_blocks=true where business_id='be020000-0000-4000-8000-000000000001';
insert into notice_results select is(pg_temp.notice_slots(current_date+30),array['20:15','21:15','22:15','23:15'],'fixed_multiple filters only starting candidates');
insert into notice_results select lives_ok(format($$select public.create_public_appointment('notice-test',null,null,%L,'20:15',2,'Two Blocks','53999999999')$$,current_date+30),'two consecutive blocks create successfully');
insert into notice_results select is((select count(*)::integer from public.appointments where business_id='be020000-0000-4000-8000-000000000001'),1,'multiple blocks create one appointment');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"be010000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into notice_results select lives_ok(format($$select public.create_admin_appointment(null,null,%L,'19:15',1,'Admin Soon','53999999999')$$,current_date+30),'Admin can create inside public notice');
insert into notice_results select lives_ok(format($$select public.create_admin_appointment(null,null,%L,'10:00',1,'Admin Outside','53999999999')$$,current_date+30),'Admin remains free of public hours');
reset role;
update notice_clock set instant=((current_date+30+time '22:30') at time zone 'America/Sao_Paulo');
insert into notice_results select ok(not pg_temp.notice_valid('23:15'),'near midnight rejects 45 minutes');
insert into notice_results select ok(pg_temp.notice_valid('23:45'),'near midnight accepts 75 minutes');
update notice_clock set instant=((current_date+30+time '23:30') at time zone 'America/Sao_Paulo');
insert into notice_results select ok(not private.public_booking_notice_is_valid('be020000-0000-4000-8000-000000000001',current_date+31,'00:15'),'notice crosses civil date boundary');
insert into notice_results select ok(private.public_booking_notice_is_valid('be020000-0000-4000-8000-000000000001',current_date+31,'00:30'),'next day exact boundary accepted');
update notice_clock set instant=((current_date+30+time '18:20') at time zone 'America/Sao_Paulo');
insert into public.booking_groups(id,business_id,position,label,active,required,occupancy_mode,intent_name)
values ('be030000-0000-4000-8000-000000000001','be020000-0000-4000-8000-000000000001',3,'Complementar',true,false,'time_slot','Complementar');
insert into public.booking_options(id,business_id,group_id,name) values ('be040000-0000-4000-8000-000000000001','be020000-0000-4000-8000-000000000001','be030000-0000-4000-8000-000000000001','Opção');
insert into notice_results select is((public.get_public_complementary_availability('notice-test',current_date+30,'19:15','20:15')->'options'->0->>'available')::boolean,false,'complementary time_slot unavailable inside notice');
insert into notice_results select is((public.get_public_complementary_availability('notice-test',current_date+30,'20:15','21:15')->'options'->0->>'available')::boolean,true,'complementary time_slot available after notice');
insert into notice_results select is((select array_agg(slot->>'start_time') from jsonb_array_elements(public.get_public_complementary_time_slots('notice-test',current_date+30)) slot),array['20:15','21:15','22:15','23:15'],'exclusive complementary slot list is filtered server-side');
insert into notice_results select throws_ok(format($$select public.create_public_reservation('notice-test','{"customer_name":"Too Soon","customer_whatsapp":"53999999999","complementary":{"option_id":"be040000-0000-4000-8000-000000000001","occupancy_mode":"time_slot","date":"%s","start_time":"19:15","end_time":"20:15"}}')$$,current_date+30),'22023','reservation_outside_business_hours','direct complementary reservation rejects insufficient notice');
insert into notice_results select lives_ok(format($$select public.create_public_reservation('notice-test','{"customer_name":"Midnight","customer_whatsapp":"53999999999","primary":{"date":"%s","start_time":"23:15","blocks":1},"complementary":{"option_id":"be040000-0000-4000-8000-000000000001","occupancy_mode":"time_slot","date":"%s","start_time":"23:15","end_time":"00:15"}}')$$,current_date+30,current_date+30),'combined public creation after notice preserves cross-midnight');
insert into notice_results select throws_ok(format($$select public.create_public_reservation('notice-test','{"customer_name":"Early Primary","customer_whatsapp":"53999999999","primary":{"date":"%s","start_time":"18:15","blocks":1},"complementary":{"option_id":"be040000-0000-4000-8000-000000000001","occupancy_mode":"time_slot","date":"%s","start_time":"22:15","end_time":"23:15"}}')$$,current_date+30,current_date+30),'22023','booking_minimum_notice','combined primary cannot bypass notice');
insert into notice_results select is((select count(*)::integer from public.reservations where business_id='be020000-0000-4000-8000-000000000001'),1,'failed combined creation leaves no partial reservation');
-- Use another date so existing appointments do not mask duration assertions.
update notice_clock set instant=((current_date+32+time '18:20') at time zone 'America/Sao_Paulo');
insert into public.booking_groups(id,business_id,position,label,active,required) values
 ('be030000-0000-4000-8000-000000000002','be020000-0000-4000-8000-000000000001',2,'Secundário',true,true),
 ('be030000-0000-4000-8000-000000000003','be020000-0000-4000-8000-000000000001',1,'Principal',true,true);
insert into public.booking_options(id,business_id,group_id,name,duration_minutes,schedule_mode) values
 ('be040000-0000-4000-8000-000000000002','be020000-0000-4000-8000-000000000001','be030000-0000-4000-8000-000000000002','90 minutos',90,'business'),
 ('be040000-0000-4000-8000-000000000003','be020000-0000-4000-8000-000000000001','be030000-0000-4000-8000-000000000003','Custom',null,'custom');
insert into public.booking_option_hours(business_id,option_id,weekday,start_time,end_time)
select 'be020000-0000-4000-8000-000000000001','be040000-0000-4000-8000-000000000003',day,'18:15','00:15' from generate_series(0,6) day;
update public.business_settings set duration_mode='group_2',allow_multiple_blocks=false where business_id='be020000-0000-4000-8000-000000000001';
insert into notice_results select is((select array_agg(slot->>'start_time') from jsonb_array_elements(public.get_booking_availability('notice-test',current_date+32,'be040000-0000-4000-8000-000000000003','be040000-0000-4000-8000-000000000002')) slot),array['19:45','21:15','22:45'],'custom schedule + group_2 duration preserve cadence with notice');
insert into notice_results select throws_ok(format($$select public.create_public_appointment('notice-test','be040000-0000-4000-8000-000000000003','be040000-0000-4000-8000-000000000002',%L,'18:15',1,'Early Secondary','53999999999')$$,current_date+32),'22023','booking_minimum_notice','group_2 direct creation enforces notice');
update notice_clock set instant=((current_date+30+time '18:20') at time zone 'America/Sao_Paulo');
-- Cancel synthetic complementary allocation before changing its mode.
update public.reservation_resources set status='cancelled' where business_id='be020000-0000-4000-8000-000000000001';
update public.booking_groups set occupancy_mode='day' where id='be030000-0000-4000-8000-000000000001';
update public.business_settings set minimum_booking_notice_minutes=1440 where business_id='be020000-0000-4000-8000-000000000001';
insert into notice_results select is((public.get_public_complementary_availability('notice-test',current_date+30)->'options'->0->>'available')::boolean,true,'day resource remains available irrespective of temporal notice');
insert into notice_results select is(public.get_public_complementary_time_slots('notice-test',current_date+30),'[]'::jsonb,'day resources do not get artificial slots');
insert into notice_results select throws_ok($$update public.business_settings set minimum_booking_notice_minutes=-1 where business_id='be020000-0000-4000-8000-000000000001'$$,'23514',null,'negative notice rejected');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"be010000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into notice_results select lives_ok($$update public.business_settings set minimum_booking_notice_minutes=120 where business_id='be020000-0000-4000-8000-000000000001'$$,'owner can save notice through existing RLS');
insert into notice_results select is((select minimum_booking_notice_minutes from public.business_settings where business_id='be020000-0000-4000-8000-000000000001'),120,'saved notice is readable when reopening configuration');
select set_config('request.jwt.claims','{"sub":"be010000-0000-4000-8000-000000000002","role":"authenticated"}',true);
update public.business_settings set minimum_booking_notice_minutes=0 where business_id='be020000-0000-4000-8000-000000000001';
reset role;
insert into notice_results select is((select minimum_booking_notice_minutes from public.business_settings where business_id='be020000-0000-4000-8000-000000000001'),120,'outsider cannot change another tenant notice');
insert into notice_results select * from finish();
select result from notice_results;
rollback;
