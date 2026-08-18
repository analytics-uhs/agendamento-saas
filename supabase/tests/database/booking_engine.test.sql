begin;

create extension if not exists pgtap with schema extensions;
select plan(14);

insert into public.businesses (id, name, slug, whatsapp)
values ('41000000-0000-4000-8000-000000000001', 'Arena Booking Test', 'arena-booking-test', '11999990000');

insert into public.business_settings (business_id, duration_mode, fixed_duration_minutes, allow_multiple_blocks)
values ('41000000-0000-4000-8000-000000000001', 'fixed', 30, false);

insert into public.booking_groups (id, business_id, position, label, active, required, sort_order)
values
  ('42000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000001', 1, 'Quadra', true, true, 1),
  ('42000000-0000-4000-8000-000000000002', '41000000-0000-4000-8000-000000000001', 2, 'Esporte', true, true, 2);

insert into public.booking_options (id, business_id, group_id, name, duration_minutes, active, sort_order)
values
  ('43000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000001', '42000000-0000-4000-8000-000000000001', 'Quadra 1', null, true, 1),
  ('43000000-0000-4000-8000-000000000003', '41000000-0000-4000-8000-000000000001', '42000000-0000-4000-8000-000000000001', 'Quadra 2', null, true, 2),
  ('43000000-0000-4000-8000-000000000002', '41000000-0000-4000-8000-000000000001', '42000000-0000-4000-8000-000000000002', 'Futevôlei', 60, true, 1);

insert into public.business_hours (business_id, weekday, active, start_time, end_time)
select '41000000-0000-4000-8000-000000000001', weekday, true, '09:00', '12:00'
from generate_series(0, 6) as weekdays(weekday);

select has_function(
  'public',
  'get_booking_availability',
  array['text', 'date', 'uuid', 'uuid'],
  'availability is exposed through a narrow RPC'
);

select has_function(
  'public',
  'create_public_appointment',
  array['text', 'uuid', 'uuid', 'date', 'time without time zone', 'integer', 'text', 'text'],
  'public appointment creation has a dedicated RPC'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select results_eq(
  $$select public.get_public_booking_page('arena-booking-test')->'business'->>'id'$$,
  array['41000000-0000-4000-8000-000000000001'::text],
  'public configuration resolves the active business without table access'
);

select results_eq(
  $$select public.get_booking_availability(
      'arena-booking-test', current_date + 30,
      '43000000-0000-4000-8000-000000000001',
      '43000000-0000-4000-8000-000000000002'
    )->0->>'start_time'$$,
  array['09:00'::text],
  'availability starts at opening time'
);

select lives_ok(
  $$select public.create_public_appointment(
    'arena-booking-test',
    '43000000-0000-4000-8000-000000000001',
    '43000000-0000-4000-8000-000000000002',
    current_date + 30, '09:00', 1, 'Cliente Teste', '(11) 98888-7777'
  )$$,
  'anonymous customer creates a validated appointment through the RPC'
);

reset role;
select results_eq(
  $$select customer_whatsapp from public.appointments
    where business_id = '41000000-0000-4000-8000-000000000001' and start_time = '09:00'$$,
  array['11988887777'::text],
  'the RPC stores a normalized WhatsApp number'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select results_eq(
  $$select count(*)::bigint
    from jsonb_array_elements(public.get_booking_availability(
      'arena-booking-test', current_date + 30,
      '43000000-0000-4000-8000-000000000001',
      '43000000-0000-4000-8000-000000000002'
    )) as slot
    where slot->>'start_time' = '09:00'$$,
  array[0::bigint],
  'an active appointment removes its overlapping slot'
);

select throws_ok(
  $$select public.create_public_appointment(
    'arena-booking-test',
    '43000000-0000-4000-8000-000000000001',
    '43000000-0000-4000-8000-000000000002',
    current_date + 30, '09:00', 1, 'Outro Cliente', '11977776666'
  )$$,
  '23P01',
  null,
  'the same Group 1 resource cannot receive overlapping appointments'
);

select lives_ok(
  $$select public.create_public_appointment(
    'arena-booking-test',
    '43000000-0000-4000-8000-000000000003',
    '43000000-0000-4000-8000-000000000002',
    current_date + 30, '09:00', 1, 'Cliente Outra Quadra', '11922221111'
  )$$,
  'different Group 1 resources can receive appointments at the same time'
);

select lives_ok(
  $$select public.create_public_appointment(
    'arena-booking-test',
    '43000000-0000-4000-8000-000000000001',
    '43000000-0000-4000-8000-000000000002',
    current_date + 30, '09:30', 1, 'Cliente Adjacente', '11966665555'
  )$$,
  'an adjacent interval is accepted'
);

reset role;
update public.appointments
set status = 'cancelled'
where business_id = '41000000-0000-4000-8000-000000000001'
  and start_time = '09:00';

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select lives_ok(
  $$select public.create_public_appointment(
    'arena-booking-test',
    '43000000-0000-4000-8000-000000000001',
    '43000000-0000-4000-8000-000000000002',
    current_date + 30, '09:00', 1, 'Cliente Reaberto', '11955554444'
  )$$,
  'a cancelled appointment no longer blocks the interval'
);

reset role;
update public.booking_groups
set active = false
where id = '42000000-0000-4000-8000-000000000001';

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select lives_ok(
  $$select public.create_public_appointment(
    'arena-booking-test', null,
    '43000000-0000-4000-8000-000000000002',
    current_date + 31, '10:00', 1, 'Cliente Sem Grupo Um', '11933332222'
  )$$,
  'without active Group 1 the first appointment uses the business as its resource'
);

select throws_ok(
  $$select public.create_public_appointment(
    'arena-booking-test', null,
    '43000000-0000-4000-8000-000000000002',
    current_date + 31, '10:00', 1, 'Conflito Sem Grupo Um', '11944442222'
  )$$,
  '23P01',
  null,
  'without active Group 1 overlapping business appointments conflict'
);

select throws_ok(
  $$insert into public.appointments (
    business_id, customer_name, customer_whatsapp, appointment_date,
    start_time, end_time, duration_minutes
  ) values (
    '41000000-0000-4000-8000-000000000001', 'Invasor', '11944443333',
    current_date + 31, '11:00', '11:30', 30
  )$$,
  '42501',
  null,
  'anonymous users cannot bypass the RPC with direct inserts'
);

select * from finish();
rollback;
