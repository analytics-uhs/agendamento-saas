begin;

create extension if not exists pgtap with schema extensions;
select plan(24);

create function pg_temp.next_monday() returns date language sql stable as $$
  select current_date + case
    when extract(dow from current_date)::integer = 1 then 7
    else (8 - extract(dow from current_date)::integer) % 7
  end
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-4000-8000-000000000001', 'midnight-owner@example.test', '{"name":"Owner"}'),
  ('d0000000-0000-4000-8000-000000000002', 'midnight-outsider@example.test', '{"name":"Outsider"}');
insert into public.businesses (id, name, slug) values
  ('d1000000-0000-4000-8000-000000000001', 'Midnight Business', 'midnight-business');
insert into public.business_members (business_id, user_id, role) values
  ('d1000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'owner');
insert into public.business_settings (
  business_id, duration_mode, fixed_duration_minutes, allow_multiple_blocks
) values (
  'd1000000-0000-4000-8000-000000000001', 'fixed', 60, false
);
insert into public.booking_groups (
  id, business_id, position, label, active, required, sort_order
) values (
  'd2000000-0000-4000-8000-000000000002',
  'd1000000-0000-4000-8000-000000000001', 2, 'Grupo 2', false, true, 2
);
insert into public.booking_options (
  id, business_id, group_id, name, duration_minutes, active, sort_order
) values (
  'd3000000-0000-4000-8000-000000000002',
  'd1000000-0000-4000-8000-000000000001',
  'd2000000-0000-4000-8000-000000000002', 'Duração longa', 120, true, 1
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select lives_ok($$
  select public.replace_business_hours('[
    {"weekday":0,"active":false,"windows":[]},
    {"weekday":1,"active":true,"windows":[{"start_time":"17:00","end_time":"00:00"}]},
    {"weekday":2,"active":true,"windows":[{"start_time":"00:00","end_time":"06:00"}]},
    {"weekday":3,"active":false,"windows":[]},
    {"weekday":4,"active":false,"windows":[]},
    {"weekday":5,"active":false,"windows":[]},
    {"weekday":6,"active":false,"windows":[]}
  ]'::jsonb)
$$, '17:00 to 00:00 and 00:00 to 06:00 are valid windows');

select is((
  select end_time::text from public.business_hours
  where business_id = 'd1000000-0000-4000-8000-000000000001' and weekday = 1
), '24:00:00', 'midnight closing is stored canonically as PostgreSQL 24:00');

select is((
  select start_time::text || '-' || end_time::text from public.business_hours
  where business_id = 'd1000000-0000-4000-8000-000000000001' and weekday = 2
), '00:00:00-06:00:00', '00:00 start retains beginning-of-day semantics');

select throws_ok($$
  select public.replace_business_hours('[
    {"weekday":0,"active":false,"windows":[]},
    {"weekday":1,"active":true,"windows":[{"start_time":"17:00","end_time":"17:00"}]},
    {"weekday":2,"active":false,"windows":[]},
    {"weekday":3,"active":false,"windows":[]},
    {"weekday":4,"active":false,"windows":[]},
    {"weekday":5,"active":false,"windows":[]},
    {"weekday":6,"active":false,"windows":[]}
  ]'::jsonb)
$$, '22023', 'business_hours_invalid_window', 'equal start and end remain invalid');

select throws_ok($$
  select public.replace_business_hours('[
    {"weekday":0,"active":false,"windows":[]},
    {"weekday":1,"active":true,"windows":[{"start_time":"22:00","end_time":"02:00"}]},
    {"weekday":2,"active":false,"windows":[]},
    {"weekday":3,"active":false,"windows":[]},
    {"weekday":4,"active":false,"windows":[]},
    {"weekday":5,"active":false,"windows":[]},
    {"weekday":6,"active":false,"windows":[]}
  ]'::jsonb)
$$, '22023', 'business_hours_invalid_window', 'arbitrary overnight windows remain invalid');

select is((
  select count(*)::integer
  from jsonb_array_elements(public.get_booking_availability(
    'midnight-business', pg_temp.next_monday(), null, null
  )) slot
  where slot ->> 'start_time' = '23:00'
), 1, 'public availability includes the 23:00 one-hour slot');

select lives_ok(format($$
  select public.create_public_appointment(
    'midnight-business', null, null, %L, '23:00', 1,
    'Public Midnight', '5553999999001'
  )
$$, pg_temp.next_monday()), 'public appointment may end exactly at midnight');

select is((
  select end_time::text from public.appointments where customer_name = 'Public Midnight'
), '24:00:00', 'appointment ending at midnight is stored as 24:00');

select throws_ok(format($$
  select public.create_admin_appointment(
    null, null, %L, '23:00', 1, 'Overlapping Midnight', '5553999999002'
  )
$$, pg_temp.next_monday()), '23P01', 'booking_conflict',
'another interval cannot overlap 23:00 to midnight');

update public.business_settings
set duration_mode = 'fixed_multiple', allow_multiple_blocks = true
where business_id = 'd1000000-0000-4000-8000-000000000001';

select throws_ok(format($$
  select public.create_admin_appointment(
    null, null, %L, '22:00', 2, 'Partial Midnight Overlap', '5553999999006'
  )
$$, pg_temp.next_monday()), '23P01', 'booking_conflict',
'22:00 to midnight conflicts with an existing 23:00 to midnight appointment');

select is((
  select (slot ->> 'max_blocks')::integer
  from jsonb_array_elements(public.get_booking_availability(
    'midnight-business', pg_temp.next_monday() + 7, null, null
  )) slot where slot ->> 'start_time' = '22:00'
), 2, 'fixed_multiple permits two blocks from 22:00 through midnight');

select is((
  select (slot ->> 'max_blocks')::integer
  from jsonb_array_elements(public.get_booking_availability(
    'midnight-business', pg_temp.next_monday() + 7, null, null
  )) slot where slot ->> 'start_time' = '23:00'
), 1, 'fixed_multiple never crosses midnight');

update public.booking_groups set active = true
where id = 'd2000000-0000-4000-8000-000000000002';
update public.business_settings
set duration_mode = 'group_2', allow_multiple_blocks = false
where business_id = 'd1000000-0000-4000-8000-000000000001';

select is((
  select count(*)::integer
  from jsonb_array_elements(public.get_booking_availability(
    'midnight-business', pg_temp.next_monday() + 14, null,
    'd3000000-0000-4000-8000-000000000002'
  )) slot where slot ->> 'start_time' = '22:00'
), 0, 'group_2 does not invent an off-grid 22:00 slot outside the 17:00 two-hour cadence');

select is((
  select count(*)::integer
  from jsonb_array_elements(public.get_booking_availability(
    'midnight-business', pg_temp.next_monday() + 14, null,
    'd3000000-0000-4000-8000-000000000002'
  )) slot where slot ->> 'start_time' = '23:00'
), 0, 'group_2 duration of 120 minutes is unavailable at 23:00');

update public.booking_groups set active = false
where id = 'd2000000-0000-4000-8000-000000000002';
update public.business_settings
set duration_mode = 'fixed', fixed_duration_minutes = 60, allow_multiple_blocks = false
where business_id = 'd1000000-0000-4000-8000-000000000001';

select lives_ok(format($$
  select public.create_calendar_blocks(
    array[]::uuid[], %L, '22:00', '00:00', 'Encerramento', false, null
  )
$$, pg_temp.next_monday() + 21), 'calendar block may end at midnight');

select is((
  select end_time::text from public.calendar_blocks where reason = 'Encerramento'
), '24:00:00', 'calendar block end is normalized to 24:00');

select is((
  select count(*)::integer
  from jsonb_array_elements(public.get_booking_availability(
    'midnight-business', pg_temp.next_monday() + 21, null, null
  )) slot where slot ->> 'start_time' in ('22:00', '23:00')
), 0, 'midnight calendar block removes its public slots');

select throws_ok(format($$
  select public.create_public_appointment(
    'midnight-business', null, null, %L, '23:00', 1,
    'Blocked Midnight', '5553999999003'
  )
$$, pg_temp.next_monday() + 21), '23P01', 'booking_conflict',
'appointment cannot overlap a calendar block ending at midnight');

select lives_ok(format($$
  select public.create_admin_appointment(
    null, null, %L, '18:00', 1, 'Editable Midnight', '5553999999004'
  )
$$, pg_temp.next_monday() + 28), 'administrative appointment is created for edit coverage');

select lives_ok(format($$
  select public.update_admin_appointment_occurrence(
    (select id from public.appointments where customer_name = 'Editable Midnight'),
    null, null, %L, '23:00', 1, 'Editable Midnight', '5553999999004'
  )
$$, pg_temp.next_monday() + 28), 'administrative edit may move an appointment to 23:00 through midnight');

select is((
  select end_time::text from public.appointments where customer_name = 'Editable Midnight'
), '24:00:00', 'edited administrative appointment keeps canonical midnight end');

select lives_ok(format($$
  select public.create_recurring_appointment_series(
    null, null, %L, '23:00', 1, 'Recurring Midnight', '5553999999005', 2
  )
$$, pg_temp.next_monday() + 35), 'administrative recurrence may end at midnight');

select is((
  select count(*)::integer from public.appointments
  where customer_name = 'Recurring Midnight' and end_time = time '24:00'
), 2, 'recurring occurrences materialize with the canonical midnight end');

select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select throws_ok($$
  select public.replace_business_hours('[
    {"weekday":0,"active":false,"windows":[]},
    {"weekday":1,"active":true,"windows":[{"start_time":"17:00","end_time":"00:00"}]},
    {"weekday":2,"active":false,"windows":[]},
    {"weekday":3,"active":false,"windows":[]},
    {"weekday":4,"active":false,"windows":[]},
    {"weekday":5,"active":false,"windows":[]},
    {"weekday":6,"active":false,"windows":[]}
  ]'::jsonb)
$$, '42501', 'business_hours_forbidden', 'unauthorized user remains blocked');

select * from finish();
rollback;
