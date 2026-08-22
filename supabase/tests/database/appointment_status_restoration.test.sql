begin;

create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users (id, email, raw_user_meta_data) values
  ('72000000-0000-4000-8000-000000000001', 'restore-owner@example.test', '{"name":"Restore Owner"}'),
  ('72000000-0000-4000-8000-000000000002', 'restore-other@example.test', '{"name":"Other Restore Owner"}');
insert into public.businesses (id, name, slug) values
  ('72100000-0000-4000-8000-000000000001', 'Restore Test', 'restore-test'),
  ('72100000-0000-4000-8000-000000000002', 'Other Restore Test', 'other-restore-test');
insert into public.business_members (business_id, user_id, role) values
  ('72100000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001', 'owner'),
  ('72100000-0000-4000-8000-000000000002', '72000000-0000-4000-8000-000000000002', 'owner');
insert into public.business_settings (business_id, duration_mode, fixed_duration_minutes, allow_multiple_blocks) values
  ('72100000-0000-4000-8000-000000000001', 'fixed', 30, false),
  ('72100000-0000-4000-8000-000000000002', 'fixed', 30, false);
insert into public.business_hours (business_id, weekday, active, start_time, end_time)
select business_id, weekday, true, '08:00', '18:00'
from (values
  ('72100000-0000-4000-8000-000000000001'::uuid),
  ('72100000-0000-4000-8000-000000000002'::uuid)
) businesses(business_id)
cross join generate_series(0, 6) weekdays(weekday);

insert into public.appointment_series (
  id, business_id, customer_name, customer_whatsapp, weekday, start_time,
  duration_minutes, blocks, starts_on, active, created_by
) values (
  '72200000-0000-4000-8000-000000000001',
  '72100000-0000-4000-8000-000000000001',
  'Recurring Restore', '53999990001', extract(dow from current_date + 30),
  '13:00', 30, 1, current_date + 30, true,
  '72000000-0000-4000-8000-000000000001'
);

insert into public.appointments (
  id, business_id, customer_name, customer_whatsapp, appointment_date,
  start_time, end_time, duration_minutes, status, series_id
) values
  ('72300000-0000-4000-8000-000000000001', '72100000-0000-4000-8000-000000000001', 'Completed', '53999990001', current_date + 30, '09:00', '09:30', 30, 'completed', null),
  ('72300000-0000-4000-8000-000000000002', '72100000-0000-4000-8000-000000000001', 'No show', '53999990002', current_date + 30, '10:00', '10:30', 30, 'no_show', null),
  ('72300000-0000-4000-8000-000000000003', '72100000-0000-4000-8000-000000000001', 'Cancelled', '53999990003', current_date + 30, '11:00', '11:30', 30, 'cancelled', null),
  ('72300000-0000-4000-8000-000000000004', '72100000-0000-4000-8000-000000000001', 'Conflict restore', '53999990004', current_date + 30, '12:00', '12:30', 30, 'cancelled', null),
  ('72300000-0000-4000-8000-000000000005', '72100000-0000-4000-8000-000000000001', 'Occupied', '53999990005', current_date + 30, '12:00', '12:30', 30, 'scheduled', null),
  ('72300000-0000-4000-8000-000000000008', '72100000-0000-4000-8000-000000000001', 'Forbidden restore', '53999990008', current_date + 30, '14:00', '14:30', 30, 'cancelled', null),
  ('72300000-0000-4000-8000-000000000009', '72100000-0000-4000-8000-000000000001', 'Elapsed cancelled', '53999990009', current_date - 1, '09:00', '09:30', 30, 'cancelled', null),
  ('72300000-0000-4000-8000-000000000010', '72100000-0000-4000-8000-000000000001', 'Elapsed completed', '53999990010', current_date - 1, '10:00', '10:30', 30, 'completed', null),
  ('72300000-0000-4000-8000-000000000011', '72100000-0000-4000-8000-000000000001', 'Elapsed no show', '53999990011', current_date - 1, '11:00', '11:30', 30, 'no_show', null),
  ('72300000-0000-4000-8000-000000000012', '72100000-0000-4000-8000-000000000001', 'Elapsed conflict', '53999990012', current_date - 1, '12:00', '12:30', 30, 'cancelled', null),
  ('72300000-0000-4000-8000-000000000013', '72100000-0000-4000-8000-000000000001', 'Elapsed occupied', '53999990013', current_date - 1, '12:00', '12:30', 30, 'scheduled', null);

select set_config('request.jwt.claims', '{"sub":"72000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('app.appointment_series_id', '72200000-0000-4000-8000-000000000001', true);
insert into public.appointments (
  id, business_id, customer_name, customer_whatsapp, appointment_date,
  start_time, end_time, duration_minutes, status
) values
  ('72300000-0000-4000-8000-000000000006', '72100000-0000-4000-8000-000000000001', 'Recurring Restore', '53999990001', current_date + 30, '13:00', '13:30', 30, 'cancelled'),
  ('72300000-0000-4000-8000-000000000007', '72100000-0000-4000-8000-000000000001', 'Recurring Restore', '53999990001', current_date + 37, '13:00', '13:30', 30, 'scheduled');
select set_config('app.appointment_series_id', '', true);
update public.appointment_series
set active = false
where id = '72200000-0000-4000-8000-000000000001';

select has_function('public', 'set_appointment_status', array['uuid', 'appointment_status'], 'status changes use the controlled RPC');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"72000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok($$select public.set_appointment_status('72300000-0000-4000-8000-000000000001', 'scheduled')$$, 'owner restores completed');
select is((select status::text from public.appointments where id = '72300000-0000-4000-8000-000000000001'), 'scheduled', 'completed returns to scheduled');
select lives_ok($$select public.set_appointment_status('72300000-0000-4000-8000-000000000002', 'scheduled')$$, 'owner restores no_show');
select is((select status::text from public.appointments where id = '72300000-0000-4000-8000-000000000002'), 'scheduled', 'no_show returns to scheduled');
select lives_ok($$select public.set_appointment_status('72300000-0000-4000-8000-000000000003', 'scheduled')$$, 'owner restores cancelled');
select is((select status::text from public.appointments where id = '72300000-0000-4000-8000-000000000003'), 'scheduled', 'cancelled returns to scheduled');
select throws_ok($$select public.set_appointment_status('72300000-0000-4000-8000-000000000004', 'scheduled')$$, '23P01', 'appointment_restore_conflict', 'occupied resource blocks restoration');
select throws_ok($$select public.set_appointment_status('72300000-0000-4000-8000-000000000004', 'completed')$$, '22023', 'appointment_invalid_status_transition', 'terminal statuses cannot transition directly');
select lives_ok($$select public.set_appointment_status('72300000-0000-4000-8000-000000000006', 'scheduled')$$, 'one recurring occurrence can be restored');
select ok(
  (select status = 'scheduled' from public.appointments where id = '72300000-0000-4000-8000-000000000006')
  and (select status = 'scheduled' from public.appointments where id = '72300000-0000-4000-8000-000000000007')
  and not (select active from public.appointment_series where id = '72200000-0000-4000-8000-000000000001'),
  'restoring one occurrence does not reactivate its series or change future occurrences'
);
select lives_ok($$select public.set_appointment_status('72300000-0000-4000-8000-000000000009', 'scheduled')$$, 'cancelled elapsed occurrence ignores itself');
select is((select status::text from public.appointments where id = '72300000-0000-4000-8000-000000000009'), 'scheduled', 'elapsed cancelled returns to scheduled');
select lives_ok($$select public.set_appointment_status('72300000-0000-4000-8000-000000000010', 'scheduled')$$, 'completed elapsed occurrence ignores itself');
select is((select status::text from public.appointments where id = '72300000-0000-4000-8000-000000000010'), 'scheduled', 'elapsed completed returns to scheduled');
select lives_ok($$select public.set_appointment_status('72300000-0000-4000-8000-000000000011', 'scheduled')$$, 'no_show elapsed occurrence ignores itself');
select is((select status::text from public.appointments where id = '72300000-0000-4000-8000-000000000011'), 'scheduled', 'elapsed no_show returns to scheduled');
select throws_ok($$select public.set_appointment_status('72300000-0000-4000-8000-000000000012', 'scheduled')$$, '23P01', 'appointment_restore_conflict', 'another elapsed appointment still blocks restoration');

select set_config('request.jwt.claims', '{"sub":"72000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok($$select public.set_appointment_status('72300000-0000-4000-8000-000000000008', 'scheduled')$$, '42501', 'appointment_not_found', 'another business cannot restore an occurrence');

select * from finish();
rollback;
