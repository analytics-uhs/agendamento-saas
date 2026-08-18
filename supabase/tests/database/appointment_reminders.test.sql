begin;

create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('80000000-0000-4000-8000-000000000001', 'reminder-owner@example.test', '{"name":"Reminder Owner"}'),
  ('80000000-0000-4000-8000-000000000002', 'reminder-admin@example.test', '{"name":"Reminder Admin"}'),
  ('80000000-0000-4000-8000-000000000003', 'reminder-other@example.test', '{"name":"Reminder Other"}');

insert into public.businesses (id, name, slug)
values
  ('81000000-0000-4000-8000-000000000001', 'Reminder Business', 'reminder-business'),
  ('81000000-0000-4000-8000-000000000002', 'Reminder Other Business', 'reminder-other-business');

insert into public.business_members (business_id, user_id, role)
values
  ('81000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001', 'owner'),
  ('81000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000002', 'admin'),
  ('81000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000003', 'owner');

insert into public.appointments (
  id, business_id, customer_name, customer_whatsapp, appointment_date,
  start_time, end_time, duration_minutes, status
)
values
  (
    '82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001',
    'Scheduled Customer', '11999990000', current_date + 7, '10:00', '10:30', 30, 'scheduled'
  ),
  (
    '82000000-0000-4000-8000-000000000002', '81000000-0000-4000-8000-000000000001',
    'Completed Customer', '11999990001', current_date + 7, '11:00', '11:30', 30, 'completed'
  );

select has_column('public', 'appointments', 'reminder_sent_at', 'appointments stores the latest reminder timestamp');
select has_column('public', 'appointments', 'reminder_sent_by', 'appointments stores the user who initiated the latest reminder');
select has_function(
  'public', 'mark_appointment_reminder_sent', array['uuid'],
  'reminder actions have a dedicated authenticated RPC'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"80000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$select public.mark_appointment_reminder_sent('82000000-0000-4000-8000-000000000001')$$,
  'an owner can record a reminder action'
);

select isnt(
  (select reminder_sent_at from public.appointments where id = '82000000-0000-4000-8000-000000000001'),
  null::timestamptz,
  'the reminder timestamp is filled'
);

select results_eq(
  $$select reminder_sent_by::text from public.appointments where id = '82000000-0000-4000-8000-000000000001'$$,
  array['80000000-0000-4000-8000-000000000001'::text],
  'the owner auth.uid is stored'
);

reset role;
update public.appointments
set reminder_sent_at = '2000-01-01 00:00:00+00'
where id = '82000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"80000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select lives_ok(
  $$select public.mark_appointment_reminder_sent('82000000-0000-4000-8000-000000000001')$$,
  'an admin can record a reminder action'
);

select ok(
  (select reminder_sent_at > '2000-01-01 00:00:00+00' from public.appointments where id = '82000000-0000-4000-8000-000000000001'),
  'a second reminder replaces the previous timestamp'
);

select results_eq(
  $$select reminder_sent_by::text from public.appointments where id = '82000000-0000-4000-8000-000000000001'$$,
  array['80000000-0000-4000-8000-000000000002'::text],
  'the latest admin auth.uid replaces the previous sender'
);

select set_config('request.jwt.claims', '{"sub":"80000000-0000-4000-8000-000000000003","role":"authenticated"}', true);

select throws_ok(
  $$select public.mark_appointment_reminder_sent('82000000-0000-4000-8000-000000000001')$$,
  '42501', null,
  'a user from another business cannot mark the reminder'
);

select set_config('request.jwt.claims', '{"sub":"80000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$select public.mark_appointment_reminder_sent('82000000-0000-4000-8000-000000000099')$$,
  '42501', null,
  'an unknown appointment fails without leaking data'
);

select throws_ok(
  $$select public.mark_appointment_reminder_sent('82000000-0000-4000-8000-000000000002')$$,
  '22023', null,
  'a terminal appointment cannot receive a reminder action'
);

select throws_ok(
  $$update public.appointments set reminder_sent_at = now()
    where id = '82000000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'authenticated users still cannot update appointments directly'
);

select * from finish();
rollback;
