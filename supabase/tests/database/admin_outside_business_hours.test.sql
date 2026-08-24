begin;

create extension if not exists pgtap with schema extensions;
select plan(15);

create function pg_temp.next_sunday() returns date language sql stable as $$
  select current_date + case when extract(dow from current_date)::integer = 0 then 7
    else 7 - extract(dow from current_date)::integer end
$$;
create function pg_temp.next_monday() returns date language sql stable as $$
  select pg_temp.next_sunday() + 1
$$;

insert into auth.users (id,email,raw_user_meta_data) values
  ('c0000000-0000-4000-8000-000000000001','outside-owner@example.test','{"name":"Owner"}'),
  ('c0000000-0000-4000-8000-000000000002','outside-none@example.test','{"name":"No Membership"}');
insert into public.businesses (id,name,slug) values
  ('c1000000-0000-4000-8000-000000000001','Outside Hours','outside-hours');
insert into public.business_members (business_id,user_id,role) values
  ('c1000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','owner');
insert into public.business_settings (business_id,duration_mode,fixed_duration_minutes,allow_multiple_blocks)
values ('c1000000-0000-4000-8000-000000000001','fixed',60,false);
insert into public.business_hours (business_id,weekday,active,start_time,end_time) values
  ('c1000000-0000-4000-8000-000000000001',1,true,'08:00','12:00'),
  ('c1000000-0000-4000-8000-000000000001',1,true,'14:00','20:00');

select is(jsonb_array_length(public.get_booking_availability('outside-hours',pg_temp.next_sunday(),null,null)),0,'public availability stays empty on a closed day');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*)::integer from jsonb_array_elements(public.get_admin_booking_availability(pg_temp.next_sunday(),null,null)) slot where slot->>'start_time'='14:00'),1,'admin availability exposes a closed-day slot');
select lives_ok(format($$select public.create_admin_appointment(null,null,%L,'14:00',1,'Closed Day','11999991001')$$,pg_temp.next_sunday()),'admin creates on a closed day');
select lives_ok(format($$select public.create_admin_appointment(null,null,%L,'06:00',1,'Before Opening','11999991002')$$,pg_temp.next_monday()),'admin creates before opening');
select lives_ok(format($$select public.create_admin_appointment(null,null,%L,'21:00',1,'After Closing','11999991003')$$,pg_temp.next_monday()),'admin creates after closing');
select lives_ok(format($$select public.create_admin_appointment(null,null,%L,'12:00',1,'Lunch Gap','11999991004')$$,pg_temp.next_monday()),'admin creates between opening windows');
select throws_ok(format($$select public.create_admin_appointment(null,null,%L,'14:00',1,'Overlap','11999991005')$$,pg_temp.next_sunday()),'23P01','booking_conflict','admin appointment conflicts remain enforced');
select lives_ok(format($$select public.create_calendar_blocks(array[]::uuid[],%L,'10:00','11:00','Internal',false,null)$$,pg_temp.next_monday()),'calendar block is created inside configured hours');
select throws_ok(format($$select public.create_admin_appointment(null,null,%L,'10:00',1,'Blocked','11999991006')$$,pg_temp.next_monday()),'23P01','booking_conflict','calendar blocks still reject admin appointments');
select is(jsonb_array_length(public.get_booking_availability('outside-hours',pg_temp.next_sunday(),null,null)),0,'outside-hours admin appointment never opens public Sunday');
select is((select count(*)::integer from jsonb_array_elements(public.get_booking_availability('outside-hours',pg_temp.next_monday(),null,null)) slot where slot->>'start_time'='21:00'),0,'public availability never exposes after-closing admin time');
select lives_ok(format($$select public.update_admin_appointment_occurrence((select id from public.appointments where customer_name='Before Opening'),null,null,%L,'18:00',1,'Moved Outside','11999991002')$$,pg_temp.next_sunday()),'admin edits an appointment to a closed day');
select lives_ok(format($$select public.create_recurring_appointment_series(null,null,%L,'16:00',1,'Outside Series','11999991007',2)$$,pg_temp.next_sunday()),'administrative recurrence is created outside business hours');
select is((select count(*)::integer from public.appointments where customer_name='Outside Series'),2,'outside-hours recurrence materializes the expected occurrences');

select set_config('request.jwt.claims','{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.get_admin_booking_availability(pg_temp.next_sunday(),null,null)$$,'42501','admin_appointment_forbidden','authenticated user without membership cannot use admin availability');

select * from finish();
rollback;
