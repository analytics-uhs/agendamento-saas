begin;

create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('50000000-0000-4000-8000-000000000001', 'agenda-owner@example.test', '{"name":"Agenda Owner"}'),
  ('50000000-0000-4000-8000-000000000002', 'other-owner@example.test', '{"name":"Other Owner"}'),
  ('50000000-0000-4000-8000-000000000003', 'agenda-admin@example.test', '{"name":"Agenda Admin"}');

insert into public.businesses (id, name, slug)
values
  ('51000000-0000-4000-8000-000000000001', 'Agenda Admin Test', 'agenda-admin-test'),
  ('51000000-0000-4000-8000-000000000002', 'Other Agenda Test', 'other-agenda-test');

insert into public.business_members (business_id, user_id, role)
values
  ('51000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'owner'),
  ('51000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', 'owner'),
  ('51000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000003', 'admin');

insert into public.business_settings (business_id, duration_mode, fixed_duration_minutes, allow_multiple_blocks)
values
  ('51000000-0000-4000-8000-000000000001', 'fixed', 30, false),
  ('51000000-0000-4000-8000-000000000002', 'fixed', 30, false);

insert into public.booking_groups (id, business_id, position, label, active, required, sort_order)
values
  ('52000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', 1, 'Quadra', true, true, 1),
  ('52000000-0000-4000-8000-000000000002', '51000000-0000-4000-8000-000000000001', 2, 'Esporte', true, true, 2);

insert into public.booking_options (id, business_id, group_id, name, active, sort_order)
values
  ('53000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', 'Quadra 1', true, 1),
  ('53000000-0000-4000-8000-000000000002', '51000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', 'Quadra 2', true, 2),
  ('53000000-0000-4000-8000-000000000003', '51000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000002', 'Futevôlei', true, 1);

insert into public.business_hours (business_id, weekday, active, start_time, end_time)
select '51000000-0000-4000-8000-000000000001', weekday, true, '09:00', '12:00'
from generate_series(0, 6) as weekdays(weekday);

insert into public.appointments (
  id, business_id, customer_name, customer_whatsapp, appointment_date,
  start_time, end_time, duration_minutes
) values (
  '54000000-0000-4000-8000-000000000002', '51000000-0000-4000-8000-000000000002',
  'Other Customer', '11900000000', current_date + 30, '11:00', '11:30', 30
);

select has_function(
  'public', 'create_admin_appointment',
  array['uuid', 'uuid', 'date', 'time without time zone', 'integer', 'text', 'text'],
  'manual creation has an authenticated RPC'
);

select has_function(
  'public', 'set_appointment_status',
  array['uuid', 'appointment_status'],
  'status changes have a dedicated RPC'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$insert into public.appointments (
    business_id, customer_name, customer_whatsapp, appointment_date,
    start_time, end_time, duration_minutes
  ) values (
    '51000000-0000-4000-8000-000000000001', 'Direct Insert', '11911110000',
    current_date + 30, '10:00', '10:30', 30
  )$$,
  '42501', null,
  'authenticated users cannot bypass the booking engine with direct inserts'
);

select lives_ok(
  $$select public.create_admin_appointment(
    '53000000-0000-4000-8000-000000000001',
    '53000000-0000-4000-8000-000000000003',
    current_date + 30, '09:00', 1, 'Manual Customer', '(11) 98888-0000'
  )$$,
  'an owner creates a manual appointment through the shared engine'
);

select results_eq(
  $$select count(*)::bigint from public.appointments
    where business_id = '51000000-0000-4000-8000-000000000001'$$,
  array[1::bigint],
  'an owner can select appointments from their own business'
);

select set_config('request.jwt.claims', '{"sub":"50000000-0000-4000-8000-000000000003","role":"authenticated"}', true);

select results_eq(
  $$select count(*)::bigint from public.appointments
    where business_id = '51000000-0000-4000-8000-000000000001'$$,
  array[1::bigint],
  'an admin can select appointments from their own business'
);

select set_config('request.jwt.claims', '{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$update public.appointments
    set customer_name = 'Direct Update'
    where business_id = '51000000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'authenticated users cannot update appointments directly'
);

select throws_ok(
  $$delete from public.appointments
    where business_id = '51000000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'authenticated users cannot delete appointments directly'
);

select results_eq(
  $$select count(*)::bigint from public.appointments
    where business_id = '51000000-0000-4000-8000-000000000002'$$,
  array[0::bigint],
  'a member cannot select appointments from another business'
);

select results_eq(
  $$select source::text, created_by::text from public.appointments
    where business_id = '51000000-0000-4000-8000-000000000001'$$,
  $$values ('admin'::text, '50000000-0000-4000-8000-000000000001'::text)$$,
  'manual appointments store their origin and creator'
);

select results_eq(
  $$select end_time::text, duration_minutes from public.appointments
    where business_id = '51000000-0000-4000-8000-000000000001'$$,
  $$values ('09:30:00'::text, 30)$$,
  'manual creation uses the configured fixed duration'
);

select throws_ok(
  $$select public.create_admin_appointment(
    '53000000-0000-4000-8000-000000000001',
    '53000000-0000-4000-8000-000000000003',
    current_date + 30, '09:00', 1, 'Conflict Customer', '11977770000'
  )$$,
  '23P01', null,
  'manual creation rejects overlap on the same resource'
);

select lives_ok(
  $$select public.create_admin_appointment(
    '53000000-0000-4000-8000-000000000002',
    '53000000-0000-4000-8000-000000000003',
    current_date + 30, '09:00', 1, 'Other Court Customer', '11966660000'
  )$$,
  'manual creation preserves independent Group 1 resources'
);

select lives_ok(
  $$select public.set_appointment_status(
    (select id from public.appointments
      where business_id = '51000000-0000-4000-8000-000000000001'
        and group_1_option_id = '53000000-0000-4000-8000-000000000001'),
    'cancelled'
  )$$,
  'an owner cancels a scheduled appointment'
);

select results_eq(
  $$select count(*)::bigint
    from jsonb_array_elements(public.get_booking_availability(
      'agenda-admin-test', current_date + 30,
      '53000000-0000-4000-8000-000000000001',
      '53000000-0000-4000-8000-000000000003'
    )) as slot
    where slot->>'start_time' = '09:00'$$,
  array[1::bigint],
  'cancelling a manual appointment releases its public slot'
);

select throws_ok(
  $$select public.set_appointment_status(
    (select id from public.appointments
      where business_id = '51000000-0000-4000-8000-000000000001'
        and group_1_option_id = '53000000-0000-4000-8000-000000000001'),
    'completed'
  )$$,
  '22023', null,
  'terminal appointments cannot transition again'
);

select throws_ok(
  $$select public.set_appointment_status(
    '54000000-0000-4000-8000-000000000002', 'cancelled'
  )$$,
  '42501', null,
  'an owner cannot change an appointment from another business'
);

reset role;
select results_eq(
  $$select source::text from public.appointments
    where id = '54000000-0000-4000-8000-000000000002'$$,
  array['public'::text],
  'appointments without admin context default to public origin'
);

select * from finish();
rollback;
