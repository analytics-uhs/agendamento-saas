begin;

create extension if not exists pgtap with schema extensions;
select plan(28);

insert into auth.users (id, email, raw_user_meta_data) values
  ('90000000-0000-4000-8000-000000000001', 'series-owner@example.test', '{"name":"Series Owner"}'),
  ('90000000-0000-4000-8000-000000000002', 'series-admin@example.test', '{"name":"Series Admin"}'),
  ('90000000-0000-4000-8000-000000000003', 'series-other@example.test', '{"name":"Series Other"}');

insert into public.businesses (id, name, slug) values
  ('91000000-0000-4000-8000-000000000001', 'Series Business', 'series-business'),
  ('91000000-0000-4000-8000-000000000002', 'Other Series Business', 'other-series-business');
insert into public.business_members (business_id, user_id, role) values
  ('91000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', 'owner'),
  ('91000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000002', 'admin'),
  ('91000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000003', 'owner');
insert into public.business_settings (business_id, duration_mode, fixed_duration_minutes, allow_multiple_blocks)
values ('91000000-0000-4000-8000-000000000001', 'fixed', 30, false),
       ('91000000-0000-4000-8000-000000000002', 'fixed', 30, false);
insert into public.business_hours (business_id, weekday, active, start_time, end_time)
select business_id, weekday, true, '08:00', '22:00'
from (values ('91000000-0000-4000-8000-000000000001'::uuid), ('91000000-0000-4000-8000-000000000002'::uuid)) businesses(business_id)
cross join generate_series(0, 6) weekdays(weekday);
insert into public.booking_groups (id, business_id, position, label, active) values
  ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 1, 'Quadra', true),
  ('92000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000001', 2, 'Esporte', true);
insert into public.booking_options (id, business_id, group_id, name, active) values
  ('93000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', 'Quadra 1', true),
  ('93000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', 'Quadra 2', true),
  ('93000000-0000-4000-8000-000000000003', '91000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000002', 'Beach Tennis', true);

select has_table('public', 'appointment_series', 'weekly series use a dedicated entity');
select has_column('public', 'appointments', 'series_id', 'appointments identify their optional series');
select has_function('public', 'materialize_recurring_appointments', array['uuid', 'date'], 'materialization has a dedicated RPC');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select lives_ok(format(
  $$select public.create_recurring_appointment_series('%s','%s',%L::date,'09:00',1,'Permanent Customer','11999990001',null)$$,
  '93000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000003', current_date + 7
), 'an owner creates a permanent weekly series');
select ok((select repeat_count is null and active from public.appointment_series where customer_name = 'Permanent Customer'), 'permanent series is active without a count');
select ok((select count(*) between 1 and 14 and max(appointment_date) <= current_date + 90 from public.appointments where customer_name = 'Permanent Customer'), 'permanent materialization is bounded by the 90 day horizon');

select lives_ok(format(
  $$select public.create_recurring_appointment_series('%s','%s',%L::date,'10:00',1,'Limited Customer','11999990002',3)$$,
  '93000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000003', current_date + 7
), 'an admin creates a count-limited weekly series');
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*)::integer from public.appointments where customer_name = 'Limited Customer'), 3, 'repeat_count is the exact total occurrence limit');
select ok((select exists(select 1 from public.appointments where customer_name = 'Limited Customer' and appointment_date = current_date + 7)), 'the selected first date is occurrence one');
select lives_ok(
  $$select public.materialize_recurring_appointments((select id from public.appointment_series where customer_name = 'Limited Customer'), current_date + 180)$$,
  'materialization can be safely repeated'
);
select is((select count(*)::integer from public.appointments where customer_name = 'Limited Customer'), 3, 'idempotent materialization never exceeds repeat_count');

reset role;
insert into public.appointments (business_id, group_1_option_id, group_2_option_id, customer_name, customer_whatsapp, appointment_date, start_time, end_time, duration_minutes)
values ('91000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000003', 'Existing Conflict', '11999990003', current_date + 14, '15:00', '15:30', 30);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(format(
  $$select public.create_recurring_appointment_series('%s','%s',%L::date,'15:00',1,'Conflicting Series','11999990004',2)$$,
  '93000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000003', current_date + 14
), '23P01', null, 'a same-resource conflict rejects the series');
select is((select count(*)::integer from public.appointment_series where customer_name = 'Conflicting Series'), 0, 'a conflict leaves no partial series');
select is((select count(*)::integer from public.appointments where customer_name = 'Conflicting Series'), 0, 'a conflict leaves no partial appointments');
select lives_ok(format(
  $$select public.create_recurring_appointment_series('%s','%s',%L::date,'15:00',1,'Other Resource','11999990005',2)$$,
  '93000000-0000-4000-8000-000000000002', '93000000-0000-4000-8000-000000000003', current_date + 14
), 'different group 1 resources can coexist at the same time');

select lives_ok(format(
  $$select public.create_recurring_appointment_series('%s','%s',%L::date,'11:00',1,'Single Cancel','11999990006',3)$$,
  '93000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000003', current_date + 7
), 'a series for single cancellation is created');
select lives_ok(
  $$select public.cancel_recurring_appointment((select id from public.appointments where customer_name = 'Single Cancel' order by appointment_date limit 1), 'single')$$,
  'one recurring occurrence can be cancelled'
);
select ok((select active from public.appointment_series where customer_name = 'Single Cancel') and (select count(*) = 2 from public.appointments where customer_name = 'Single Cancel' and status = 'scheduled'), 'single cancellation keeps the series and its following occurrences');
select lives_ok(
  $$select public.materialize_recurring_appointments((select id from public.appointment_series where customer_name = 'Single Cancel'), current_date + 90)$$,
  'a cancelled occurrence does not break later materialization'
);
select is((select count(*)::integer from public.appointments where customer_name = 'Single Cancel'), 3, 'idempotent materialization never recreates a cancelled occurrence');

select lives_ok(format(
  $$select public.create_recurring_appointment_series('%s','%s',%L::date,'12:00',1,'Status Series','11999990007',4)$$,
  '93000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000003', current_date + 7
), 'a status-transition series is created');
select lives_ok($$select public.set_appointment_status((select id from public.appointments where customer_name = 'Status Series' order by appointment_date limit 1), 'completed')$$, 'completed affects one occurrence');
select lives_ok($$select public.set_appointment_status((select id from public.appointments where customer_name = 'Status Series' order by appointment_date offset 1 limit 1), 'no_show')$$, 'no_show affects one occurrence');
select ok((select active from public.appointment_series where customer_name = 'Status Series') and (select count(*) = 2 from public.appointments where customer_name = 'Status Series' and status = 'scheduled'), 'completed and no_show do not end the series or change future appointments');
select lives_ok(
  $$select public.cancel_recurring_appointment((select id from public.appointments where customer_name = 'Status Series' and status = 'scheduled' order by appointment_date limit 1), 'future')$$,
  'selected and following scheduled occurrences can be cancelled atomically'
);
select ok(not (select active from public.appointment_series where customer_name = 'Status Series') and (select count(*) = 1 from public.appointments where customer_name = 'Status Series' and status = 'completed') and (select count(*) = 1 from public.appointments where customer_name = 'Status Series' and status = 'no_show'), 'future cancellation ends the series without changing its prior history');
select lives_ok(
  $$select public.materialize_recurring_appointments((select id from public.appointment_series where customer_name = 'Status Series'), current_date + 180)$$,
  'materializing an inactive series is a harmless no-op'
);

select set_config('test.permanent_series_id', (select id::text from public.appointment_series where customer_name = 'Permanent Customer'), true);
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$select public.materialize_recurring_appointments(current_setting('test.permanent_series_id')::uuid, current_date + 90)$$,
  '42501', null, 'a user from another business cannot materialize a series'
);

select * from finish();
rollback;
