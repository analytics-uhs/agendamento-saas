begin;

create extension if not exists pgtap with schema extensions;
create temp table reservation_allocation_tap_results (result text);
grant insert, select on reservation_allocation_tap_results to anon, authenticated;
insert into reservation_allocation_tap_results select plan(27);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('d1000000-0000-4000-8000-000000000001', 'allocation-owner-a@example.test', '{"name":"Owner A"}'),
  ('d1000000-0000-4000-8000-000000000002', 'allocation-owner-b@example.test', '{"name":"Owner B"}');

insert into public.businesses (id, name, slug)
values
  ('d2000000-0000-4000-8000-000000000001', 'Allocation A', 'allocation-a'),
  ('d2000000-0000-4000-8000-000000000002', 'Allocation B', 'allocation-b');

insert into public.business_members (business_id, user_id, role)
values
  ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'owner'),
  ('d2000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000002', 'owner');

insert into public.booking_groups (id, business_id, position, label, occupancy_mode)
values
  ('d3000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 3, 'Complementar A', 'day'),
  ('d3000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000002', 3, 'Complementar B', 'time_slot');

insert into public.booking_options (id, business_id, group_id, name)
values
  ('d4000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001', 'Espaço A1'),
  ('d4000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001', 'Espaço A2'),
  ('d4000000-0000-4000-8000-000000000003', 'd2000000-0000-4000-8000-000000000002', 'd3000000-0000-4000-8000-000000000002', 'Espaço B1');

insert into public.reservations (id, business_id, customer_name, customer_whatsapp, source)
values
  ('d5000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'Cliente A', '53999990001', 'public'),
  ('d5000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000002', 'Cliente B', '53999990002', 'public');

insert into reservation_allocation_tap_results select has_table('public', 'reservations', 'reservations exists');
insert into reservation_allocation_tap_results select has_table('public', 'reservation_resources', 'reservation_resources exists');
insert into reservation_allocation_tap_results select has_table('public', 'resource_allocations', 'resource_allocations exists');
insert into reservation_allocation_tap_results select has_column('public', 'appointments', 'reservation_id', 'appointments has aggregate link');
insert into reservation_allocation_tap_results select col_is_null('public', 'appointments', 'reservation_id', 'appointments.reservation_id remains nullable');

insert into reservation_allocation_tap_results select lives_ok(
  $$insert into public.appointments (
      id, business_id, customer_name, customer_whatsapp, appointment_date,
      start_time, end_time, duration_minutes, status
    ) values (
      'd6000000-0000-4000-8000-000000000001',
      'd2000000-0000-4000-8000-000000000001',
      'Legado', '53999990003', current_date + 1000,
      '08:00', '09:00', 60, 'cancelled'
    )$$,
  'legacy appointments remain valid without a reservation'
);

insert into reservation_allocation_tap_results select results_eq(
  $$select reservation_id from public.appointments where id = 'd6000000-0000-4000-8000-000000000001'$$,
  $$values (null::uuid)$$,
  'legacy appointment keeps reservation_id null'
);

insert into reservation_allocation_tap_results select throws_ok(
  $$insert into public.reservation_resources (
      reservation_id, business_id, group_id, option_id, occupancy_mode,
      reservation_date, option_name_snapshot, group_name_snapshot
    ) values (
      'd5000000-0000-4000-8000-000000000001',
      'd2000000-0000-4000-8000-000000000001',
      'd3000000-0000-4000-8000-000000000001',
      'd4000000-0000-4000-8000-000000000003',
      'day', '2035-01-01', 'ignored', 'ignored'
    )$$,
  '23514', 'reservation_resource_option_invalid',
  'a reservation cannot use an option from another tenant'
);

insert into reservation_allocation_tap_results select throws_ok(
  $$insert into public.reservation_resources (
      reservation_id, business_id, group_id, option_id, occupancy_mode,
      reservation_date, start_time, end_time, option_name_snapshot, group_name_snapshot
    ) values (
      'd5000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001',
      'd3000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001',
      'day', '2035-01-01', '08:00', '09:00', 'ignored', 'ignored'
    )$$,
  '23514', null,
  'day occupancy rejects domain times'
);

insert into reservation_allocation_tap_results select throws_ok(
  $$insert into public.reservation_resources (
      reservation_id, business_id, group_id, option_id, occupancy_mode,
      reservation_date, option_name_snapshot, group_name_snapshot
    ) values (
      'd5000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000002',
      'd3000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-000000000003',
      'time_slot', '2035-01-01', 'ignored', 'ignored'
    )$$,
  '23514', null,
  'time_slot occupancy requires both times'
);

insert into reservation_allocation_tap_results select throws_ok(
  $$insert into public.reservation_resources (
      reservation_id, business_id, group_id, option_id, occupancy_mode,
      reservation_date, start_time, end_time, option_name_snapshot, group_name_snapshot
    ) values (
      'd5000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000002',
      'd3000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-000000000003',
      'time_slot', '2035-01-01', '10:00', '10:00', 'ignored', 'ignored'
    )$$,
  '23514', null,
  'time_slot rejects an empty or reversed interval'
);

insert into reservation_allocation_tap_results select lives_ok(
  $$insert into public.reservation_resources (
      id, reservation_id, business_id, group_id, option_id, occupancy_mode,
      reservation_date, option_name_snapshot, group_name_snapshot
    ) values (
      'd7000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001',
      'd2000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001',
      'd4000000-0000-4000-8000-000000000001', 'day', '2035-01-02', 'ignored', 'ignored'
    )$$,
  'a whole-day component creates its allocation'
);

insert into reservation_allocation_tap_results select results_eq(
  $$select
      lower(occupied_period),
      upper(occupied_period),
      lower_inc(occupied_period),
      upper_inc(occupied_period)
    from public.resource_allocations
    where reservation_resource_id = 'd7000000-0000-4000-8000-000000000001'$$,
  $$values (
      timestamp '2035-01-02 00:00:00',
      timestamp '2035-01-03 00:00:00',
      true,
      false
    )$$,
  'day occupancy uses a closed-open local civil-day range only in allocations'
);

insert into reservation_allocation_tap_results select throws_ok(
  $$insert into public.reservation_resources (
      reservation_id, business_id, group_id, option_id, occupancy_mode,
      reservation_date, option_name_snapshot, group_name_snapshot
    ) values (
      'd5000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001',
      'd3000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001',
      'day', '2035-01-02', 'ignored', 'ignored'
    )$$,
  '23P01', null,
  'the same option conflicts on the same whole day'
);

insert into reservation_allocation_tap_results select lives_ok(
  $$insert into public.reservation_resources (
      reservation_id, business_id, group_id, option_id, occupancy_mode,
      reservation_date, option_name_snapshot, group_name_snapshot
    ) values (
      'd5000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001',
      'd3000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000002',
      'day', '2035-01-02', 'ignored', 'ignored'
    )$$,
  'different options coexist on the same whole day'
);

insert into reservation_allocation_tap_results select lives_ok(
  $$insert into public.reservation_resources (
      id, reservation_id, business_id, group_id, option_id, occupancy_mode,
      reservation_date, start_time, end_time, option_name_snapshot, group_name_snapshot
    ) values (
      'd7000000-0000-4000-8000-000000000002', 'd5000000-0000-4000-8000-000000000002',
      'd2000000-0000-4000-8000-000000000002', 'd3000000-0000-4000-8000-000000000002',
      'd4000000-0000-4000-8000-000000000003', 'time_slot', '2035-01-03',
      '09:00', '10:00', 'ignored', 'ignored'
    )$$,
  'a time-slot component creates its allocation'
);

insert into reservation_allocation_tap_results select throws_ok(
  $$insert into public.reservation_resources (
      reservation_id, business_id, group_id, option_id, occupancy_mode,
      reservation_date, start_time, end_time, option_name_snapshot, group_name_snapshot
    ) values (
      'd5000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000002',
      'd3000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-000000000003',
      'time_slot', '2035-01-03', '09:30', '10:30', 'ignored', 'ignored'
    )$$,
  '23P01', null,
  'overlapping time slots conflict in the database'
);

insert into reservation_allocation_tap_results select lives_ok(
  $$insert into public.reservation_resources (
      reservation_id, business_id, group_id, option_id, occupancy_mode,
      reservation_date, start_time, end_time, option_name_snapshot, group_name_snapshot
    ) values (
      'd5000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000002',
      'd3000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-000000000003',
      'time_slot', '2035-01-03', '10:00', '11:00', 'ignored', 'ignored'
    )$$,
  'adjacent time slots are allowed'
);

insert into reservation_allocation_tap_results select lives_ok(
  $$select private.set_reservation_resource_status(
      'd7000000-0000-4000-8000-000000000001', 'cancelled'
    );
    insert into public.reservation_resources (
      reservation_id, business_id, group_id, option_id, occupancy_mode,
      reservation_date, option_name_snapshot, group_name_snapshot
    ) values (
      'd5000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001',
      'd3000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001',
      'day', '2035-01-02', 'ignored', 'ignored'
    )$$,
  'cancelling only the component releases its allocation'
);

update public.booking_options
set name = 'Espaço B1 renomeado'
where id = 'd4000000-0000-4000-8000-000000000003';

update public.booking_groups
set label = 'Complementar B renomeado'
where id = 'd3000000-0000-4000-8000-000000000002';

insert into reservation_allocation_tap_results select results_eq(
  $$select active from public.resource_allocations
    where reservation_resource_id = 'd7000000-0000-4000-8000-000000000001'$$,
  $$values (false)$$,
  'the cancelled component allocation is inactive'
);

insert into reservation_allocation_tap_results select results_eq(
  $$select option_name_snapshot, group_name_snapshot
    from public.reservation_resources
    where id = 'd7000000-0000-4000-8000-000000000002'$$,
  $$values ('Espaço B1'::text, 'Complementar B'::text)$$,
  'catalog snapshots survive later option and group renames'
);

insert into reservation_allocation_tap_results select results_eq(
  $$select
      has_table_privilege('authenticated', 'public.reservations', 'insert')
      or has_table_privilege('authenticated', 'public.reservation_resources', 'insert')
      or has_table_privilege('authenticated', 'public.resource_allocations', 'insert')
      or has_table_privilege('authenticated', 'public.resource_allocations', 'update')$$,
  array[false],
  'authenticated clients receive no direct critical mutation grants'
);

set local role anon;
insert into reservation_allocation_tap_results select throws_ok(
  $$select count(*) from public.reservations$$,
  '42501', null,
  'anonymous users cannot read reservations directly'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into reservation_allocation_tap_results select results_eq(
  $$select count(*)::bigint from public.reservations$$,
  array[1::bigint],
  'a member reads reservations from the own business'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
insert into reservation_allocation_tap_results select results_eq(
  $$select (
      (select count(*) from public.reservations
        where business_id = 'd2000000-0000-4000-8000-000000000001')
      + (select count(*) from public.reservation_resources
        where business_id = 'd2000000-0000-4000-8000-000000000001')
      + (select count(*) from public.resource_allocations
        where business_id = 'd2000000-0000-4000-8000-000000000001')
    )::bigint$$,
  array[0::bigint],
  'another tenant cannot read reservations, components or allocations'
);
reset role;

insert into reservation_allocation_tap_results select throws_ok(
  $$insert into public.appointments (
      business_id, reservation_id, customer_name, customer_whatsapp,
      appointment_date, start_time, end_time, duration_minutes, status
    ) values (
      'd2000000-0000-4000-8000-000000000002',
      'd5000000-0000-4000-8000-000000000001',
      'Tenant inválido', '53999990004', current_date + 1001,
      '08:00', '09:00', 60, 'cancelled'
    )$$,
  '23503', null,
  'appointment and reservation must belong to the same tenant'
);

insert into reservation_allocation_tap_results select throws_ok(
  $$insert into public.resource_allocations (
      business_id, option_id, reservation_resource_id, occupancy_mode,
      allocation_date, active
    ) values (
      'd2000000-0000-4000-8000-000000000001',
      'd4000000-0000-4000-8000-000000000001',
      'd7000000-0000-4000-8000-000000000099',
      'day', '2035-01-10', true
    )$$,
  '23503', null,
  'an allocation cannot exist without a valid component'
);

insert into reservation_allocation_tap_results select * from finish();
select result from reservation_allocation_tap_results;
rollback;
