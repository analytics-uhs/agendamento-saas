begin;
create extension if not exists pgtap with schema extensions;
create temp table admin_complementary_tap_results(result text);
grant insert,select on admin_complementary_tap_results to anon,authenticated;
insert into admin_complementary_tap_results select no_plan();

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

create function pg_temp.payload(d date, combined boolean default false, slot boolean default false) returns jsonb language sql as $$
select jsonb_build_object('customer_name','Weekly Test','customer_whatsapp','53999990001','complementary',
  jsonb_build_object('option_id',case when slot then 'b7300000-0000-4000-8000-000000000004' else 'b7300000-0000-4000-8000-000000000002' end,
    'occupancy_mode',case when slot then 'time_slot' else 'day' end,'date',d) || case when slot then '{"start_time":"18:30","end_time":"19:30"}'::jsonb else '{}' end)
  || case when combined then jsonb_build_object('primary',jsonb_build_object('group_1_option_id','b7300000-0000-4000-8000-000000000001','group_2_option_id',null,'date',d,'start_time','18:00','blocks',1)) else '{}' end;
$$;
create function pg_temp.attempt(d date,n integer,combined boolean default false) returns jsonb language plpgsql as $$
declare diagnostic text;
begin
  perform public.create_admin_reservation_series('b7100000-0000-4000-8000-000000000001',pg_temp.payload(d,combined),n);
  return '[]';
exception when exclusion_violation then get stacked diagnostics diagnostic=PG_EXCEPTION_DETAIL;return diagnostic::jsonb;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b7000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into admin_complementary_tap_results select lives_ok(format($$select public.create_admin_reservation_series('b7100000-0000-4000-8000-000000000001',pg_temp.payload(%L),4)$$,current_date+20),'day creates all four occurrences');
insert into admin_complementary_tap_results select is((select count(*) from public.reservations where series_id is not null),4::bigint,'all aggregates identified');
insert into admin_complementary_tap_results select is((select count(*) from public.reservation_resources where start_time is null and end_time is null),4::bigint,'day never gains fictitious hours');
insert into admin_complementary_tap_results select is(jsonb_array_length(pg_temp.attempt(current_date+20,4)),4,'all conflicting dates returned');
insert into admin_complementary_tap_results select is(jsonb_array_length(pg_temp.attempt(current_date+6,3)),1,'conflict last week');
insert into admin_complementary_tap_results select is(jsonb_array_length(pg_temp.attempt(current_date+13,3)),2,'conflict middle and last');
insert into admin_complementary_tap_results select is(jsonb_array_length(pg_temp.attempt(current_date+41,3)),1,'conflict first week');
insert into admin_complementary_tap_results select is((select count(*) from public.reservations where series_id is not null),4::bigint,'failed attempts create zero aggregates');
insert into admin_complementary_tap_results select is(pg_temp.attempt(current_date+13,3)->1->>'date',(current_date+27)::text,'diagnostics return the exact second conflicting date');
insert into admin_complementary_tap_results select throws_ok(format($$select public.create_admin_reservation_series('b7100000-0000-4000-8000-000000000001',pg_temp.payload(%L,true),3)$$,current_date+80),'22023','reservation_series_complementary_only','combined recurrence is outside MVP');
insert into admin_complementary_tap_results select throws_ok($$select public.cancel_admin_reservation_series(null,null,'future')$$,'42501','permission denied for function cancel_admin_reservation_series','new series cancellation is not exposed');
insert into admin_complementary_tap_results select lives_ok(format($$select public.create_admin_reservation(%L::jsonb)$$,pg_temp.payload(current_date+100)),'one-off complementary creation remains available');
insert into admin_complementary_tap_results select is((select count(*) from public.reservations where series_id is null),1::bigint,'one-off has no series identity');
insert into admin_complementary_tap_results select throws_ok(format($$select public.create_admin_reservation_series('b7100000-0000-4000-8000-000000000001',pg_temp.payload(%L),261)$$,current_date+80),'22023','reservation_series_invalid','maximum count enforced');
insert into admin_complementary_tap_results select throws_ok(format($$select public.create_admin_reservation_series('b7100000-0000-4000-8000-000000000001',pg_temp.payload(%L),null)$$,current_date+80),'22023','reservation_series_invalid','no permanent series');
select set_config('request.jwt.claims','{"sub":"b7000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
insert into admin_complementary_tap_results select throws_ok(format($$select public.create_admin_reservation_series('b7100000-0000-4000-8000-000000000001',pg_temp.payload(%L),3)$$,current_date+80),'42501','reservation_series_forbidden','cross tenant rejected');
insert into admin_complementary_tap_results select is((select count(*) from public.reservation_series),0::bigint,'series RLS isolates tenants');
insert into admin_complementary_tap_results select lives_ok(format($$select public.create_admin_reservation_series('b7100000-0000-4000-8000-000000000002',pg_temp.payload(%L,false,true),3)$$,current_date+20),'other tenant creates same dates without false conflict or public-hours restriction');
insert into admin_complementary_tap_results select is((select count(*) from public.reservation_resources where start_time='18:30' and end_time='19:30'),3::bigint,'same local time in every week');
insert into admin_complementary_tap_results select throws_ok(format($$select public.create_admin_reservation_series('b7100000-0000-4000-8000-000000000002',%L::jsonb,3)$$,jsonb_set(pg_temp.payload(current_date+20,false,true),'{complementary,start_time}','"18:45"')),'23P01','reservation_series_conflict','time-slot overlap rejects whole series');
insert into admin_complementary_tap_results select is((select count(*) from public.reservations),3::bigint,'overlapping time-slot attempt leaves no rows');
select set_config('request.jwt.claims','{"sub":"b7000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into admin_complementary_tap_results select lives_ok($$select public.create_admin_resource_blocks(array['b7300000-0000-4000-8000-000000000002'::uuid],current_date+87)$$,'resource block fixture');
insert into admin_complementary_tap_results select is(jsonb_array_length(pg_temp.attempt(current_date+80,3)),1,'resource block rejects entire series');
insert into admin_complementary_tap_results select is((select count(*) from public.reservations where series_date>=current_date+80),0::bigint,'no partial rows around blocked date');
reset role;
update public.booking_options set active=true where id='b7300000-0000-4000-8000-000000000003';
set local role authenticated;
insert into admin_complementary_tap_results select lives_ok(format($$select public.create_admin_reservation_series('b7100000-0000-4000-8000-000000000001',%L::jsonb,3)$$,jsonb_set(pg_temp.payload(current_date+20),'{complementary,option_id}','"b7300000-0000-4000-8000-000000000003"')),'different resource has no false conflict');
reset role;
create function pg_temp.force_weekly_race() returns trigger language plpgsql as $$
begin
  if new.reservation_date=current_date+314 and new.business_id='b7100000-0000-4000-8000-000000000001' then raise exception 'synthetic concurrent exclusion' using errcode='23P01'; end if;
  return new;
end $$;
create trigger test_weekly_race before insert on public.reservation_resources for each row execute function pg_temp.force_weekly_race();
set local role authenticated;
insert into admin_complementary_tap_results select is(jsonb_array_length(pg_temp.attempt(current_date+300,3)),1,'late exclusion failure is reported');
insert into admin_complementary_tap_results select is((select count(*) from public.reservations where series_date>=current_date+300),0::bigint,'late failure rolls back earlier aggregates');
insert into admin_complementary_tap_results select is((select count(*) from public.resource_allocations where allocation_date>=current_date+300),0::bigint,'late failure rolls back allocations');
insert into admin_complementary_tap_results select is((select count(*) from public.reservation_series where starts_on>=current_date+300),0::bigint,'late failure rolls back series identity');
set local role anon;
insert into admin_complementary_tap_results select throws_ok($$select public.create_admin_reservation_series(null,'{}',3)$$,'42501','permission denied for function create_admin_reservation_series','no public recurrence');
reset role;
insert into admin_complementary_tap_results select * from finish();
select result from admin_complementary_tap_results;
rollback;
