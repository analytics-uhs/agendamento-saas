begin;

create extension if not exists pgtap with schema extensions;
create temp table complementary_reservation_tap_results (result text);
grant insert, select on complementary_reservation_tap_results to anon, authenticated;
insert into complementary_reservation_tap_results select plan(33);

create temp table complementary_test_dates as
select
  current_date + 1000 as day_open,
  current_date + 1001 as day_closed,
  current_date + 1002 as slot_open,
  current_date + 1003 as primary_open,
  current_date + 1004 as conflict_primary,
  current_date + 1005 as conflict_complementary;

grant select on complementary_test_dates to anon, authenticated;

insert into auth.users (id, email, raw_user_meta_data)
values ('a1000000-0000-4000-8000-000000000001', 'complementary-owner@example.test', '{"name":"Owner"}');

insert into public.businesses (id, name, slug, active)
values
  ('a2000000-0000-4000-8000-000000000001', 'Reserva Day', 'reservation-public-day', true),
  ('a2000000-0000-4000-8000-000000000002', 'Reserva Slot', 'reservation-public-slot', true),
  ('a2000000-0000-4000-8000-000000000003', 'Outro Tenant', 'reservation-public-other', true),
  ('a2000000-0000-4000-8000-000000000004', 'Grupo Inativo', 'reservation-public-inactive', true);

insert into public.business_members (business_id, user_id, role)
values ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'owner');

insert into public.business_settings (
  business_id, duration_mode, fixed_duration_minutes, allow_multiple_blocks
)
values
  ('a2000000-0000-4000-8000-000000000001', 'fixed', 60, false),
  ('a2000000-0000-4000-8000-000000000002', 'fixed', 60, false),
  ('a2000000-0000-4000-8000-000000000003', 'fixed', 60, false),
  ('a2000000-0000-4000-8000-000000000004', 'fixed', 60, false);

insert into public.booking_groups (
  id, business_id, position, label, intent_name, occupancy_mode, active, required, sort_order
)
values
  ('a3000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 1, 'Recurso', null, null, true, true, 1),
  ('a3000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000001', 2, 'Atividade', null, null, true, true, 2),
  ('a3000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000001', 3, 'Complemento por dia', 'Complemento', 'day', true, false, 3),
  ('a3000000-0000-4000-8000-000000000004', 'a2000000-0000-4000-8000-000000000002', 3, 'Complemento por horário', 'Equipamento', 'time_slot', true, false, 3),
  ('a3000000-0000-4000-8000-000000000005', 'a2000000-0000-4000-8000-000000000003', 3, 'Outro complemento', 'Outro', 'day', true, false, 3),
  ('a3000000-0000-4000-8000-000000000006', 'a2000000-0000-4000-8000-000000000004', 3, 'Complemento inativo', 'Inativo', 'day', false, false, 3);

insert into public.booking_options (
  id, business_id, group_id, name, duration_minutes, active, sort_order
)
values
  ('a4000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'Recurso 1', null, true, 0),
  ('a4000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000002', 'Atividade 1', 60, true, 0),
  ('a4000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000003', 'Complemento A', null, true, 0),
  ('a4000000-0000-4000-8000-000000000004', 'a2000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000003', 'Complemento B', null, true, 1),
  ('a4000000-0000-4000-8000-000000000005', 'a2000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000003', 'Complemento inativo', null, false, 2),
  ('a4000000-0000-4000-8000-000000000006', 'a2000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000004', 'Projetor', null, true, 0),
  ('a4000000-0000-4000-8000-000000000007', 'a2000000-0000-4000-8000-000000000003', 'a3000000-0000-4000-8000-000000000005', 'Opção externa', null, true, 0),
  ('a4000000-0000-4000-8000-000000000008', 'a2000000-0000-4000-8000-000000000004', 'a3000000-0000-4000-8000-000000000006', 'Opção oculta', null, true, 0);

insert into public.business_hours (business_id, weekday, active, start_time, end_time)
select business_id, weekday, true, '08:00', '18:00'
from (
  select 'a2000000-0000-4000-8000-000000000001'::uuid as business_id,
    extract(dow from day_open)::integer as weekday from complementary_test_dates
  union
  select 'a2000000-0000-4000-8000-000000000001'::uuid,
    extract(dow from primary_open)::integer from complementary_test_dates
  union
  select 'a2000000-0000-4000-8000-000000000001'::uuid,
    extract(dow from conflict_primary)::integer from complementary_test_dates
  union
  select 'a2000000-0000-4000-8000-000000000001'::uuid,
    extract(dow from conflict_complementary)::integer from complementary_test_dates
  union
  select 'a2000000-0000-4000-8000-000000000002'::uuid,
    extract(dow from slot_open)::integer from complementary_test_dates
) as windows;

set local role anon;
insert into complementary_reservation_tap_results select results_eq(
  format(
    $$select (option ->> 'available')::boolean from jsonb_array_elements(
      public.get_public_complementary_availability('reservation-public-day', %L, null, null) -> 'options'
    ) option where option ->> 'name' = 'Complemento A'$$,
    (select day_open from complementary_test_dates)
  ),
  array[true],
  'day option is publicly available on an open business day'
);
reset role;

insert into public.reservations (id, business_id, customer_name, customer_whatsapp, source)
values ('a5000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'Ocupante', '53999990001', 'public');
insert into public.reservation_resources (
  reservation_id, business_id, group_id, option_id, occupancy_mode,
  reservation_date, option_name_snapshot, group_name_snapshot
)
select 'a5000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000003', 'a4000000-0000-4000-8000-000000000003',
  'day', day_open, 'ignored', 'ignored'
from complementary_test_dates;

set local role anon;
insert into complementary_reservation_tap_results select results_eq(
  format(
    $$select (option ->> 'available')::boolean from jsonb_array_elements(
      public.get_public_complementary_availability('reservation-public-day', %L, null, null) -> 'options'
    ) option where option ->> 'name' = 'Complemento A'$$,
    (select day_open from complementary_test_dates)
  ), array[false], 'occupied day option is unavailable'
);
insert into complementary_reservation_tap_results select results_eq(
  format(
    $$select (option ->> 'available')::boolean from jsonb_array_elements(
      public.get_public_complementary_availability('reservation-public-day', %L, null, null) -> 'options'
    ) option where option ->> 'name' = 'Complemento B'$$,
    (select day_open from complementary_test_dates)
  ), array[true], 'different day options coexist on the same date'
);
insert into complementary_reservation_tap_results select results_eq(
  format(
    $$select bool_and(not (option ->> 'available')::boolean) from jsonb_array_elements(
      public.get_public_complementary_availability('reservation-public-day', %L, null, null) -> 'options'
    ) option$$,
    (select day_closed from complementary_test_dates)
  ), array[true], 'day availability is false when the business is closed'
);
insert into complementary_reservation_tap_results select results_eq(
  format(
    $$select (option ->> 'available')::boolean from jsonb_array_elements(
      public.get_public_complementary_availability('reservation-public-slot', %L, '09:00', '10:00') -> 'options'
    ) option$$,
    (select slot_open from complementary_test_dates)
  ), array[true], 'time-slot inside business hours is available'
);
insert into complementary_reservation_tap_results select results_eq(
  format(
    $$select (option ->> 'available')::boolean from jsonb_array_elements(
      public.get_public_complementary_availability('reservation-public-slot', %L, '07:00', '08:00') -> 'options'
    ) option$$,
    (select slot_open from complementary_test_dates)
  ), array[false], 'time-slot outside business hours is unavailable'
);
reset role;

insert into public.reservations (id, business_id, customer_name, customer_whatsapp, source)
values ('a5000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000002', 'Ocupante Slot', '53999990002', 'public');
insert into public.reservation_resources (
  reservation_id, business_id, group_id, option_id, occupancy_mode,
  reservation_date, start_time, end_time, option_name_snapshot, group_name_snapshot
)
select 'a5000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000002',
  'a3000000-0000-4000-8000-000000000004', 'a4000000-0000-4000-8000-000000000006',
  'time_slot', slot_open, '09:00', '10:00', 'ignored', 'ignored'
from complementary_test_dates;

set local role anon;
insert into complementary_reservation_tap_results select results_eq(
  format(
    $$select (option ->> 'available')::boolean from jsonb_array_elements(
      public.get_public_complementary_availability('reservation-public-slot', %L, '09:30', '10:30') -> 'options'
    ) option$$,
    (select slot_open from complementary_test_dates)
  ), array[false], 'overlapping time-slot is unavailable'
);
insert into complementary_reservation_tap_results select results_eq(
  format(
    $$select (option ->> 'available')::boolean from jsonb_array_elements(
      public.get_public_complementary_availability('reservation-public-slot', %L, '10:00', '11:00') -> 'options'
    ) option$$,
    (select slot_open from complementary_test_dates)
  ), array[true], 'adjacent time-slot remains available'
);
insert into complementary_reservation_tap_results select results_eq(
  format(
    $$select count(*)::bigint from jsonb_array_elements(
      public.get_public_complementary_availability('reservation-public-day', %L, null, null) -> 'options'
    ) option where option ->> 'name' = 'Complemento inativo'$$,
    (select day_open from complementary_test_dates)
  ), array[0::bigint], 'inactive option is not published'
);
insert into complementary_reservation_tap_results select results_eq(
  format(
    $$select jsonb_array_length(public.get_public_complementary_availability(
      'reservation-public-inactive', %L, null, null
    ) -> 'options')$$,
    (select day_open from complementary_test_dates)
  ), array[0], 'inactive complementary group is not published'
);
insert into complementary_reservation_tap_results select results_eq(
  format(
    $$select count(*)::bigint from jsonb_array_elements(
      public.get_public_complementary_availability('reservation-public-day', %L, null, null) -> 'options'
    ) option where option ->> 'option_id' = 'a4000000-0000-4000-8000-000000000007'$$,
    (select day_open from complementary_test_dates)
  ), array[0::bigint], 'availability never leaks an option from another business'
);
reset role;

set local role anon;
insert into complementary_reservation_tap_results select lives_ok(
  format(
    $$select public.create_public_reservation('reservation-public-day', jsonb_build_object(
      'customer_name','Cliente Principal','customer_whatsapp','(53) 99999-1001',
      'primary',jsonb_build_object(
        'group_1_option_id','a4000000-0000-4000-8000-000000000001',
        'group_2_option_id','a4000000-0000-4000-8000-000000000002',
        'date',%L,'start_time','09:00','blocks',1
      )
    ))$$,
    (select primary_open from complementary_test_dates)
  ), 'primary-only aggregate reservation succeeds'
);
reset role;
insert into complementary_reservation_tap_results select results_eq(
  $$select count(*)::bigint from public.appointments where customer_name = 'Cliente Principal' and reservation_id is not null$$,
  array[1::bigint], 'primary appointment is linked to its reservation'
);

set local role anon;
insert into complementary_reservation_tap_results select lives_ok(
  format(
    $$select public.create_public_reservation('reservation-public-day', jsonb_build_object(
      'customer_name','Cliente Day','customer_whatsapp','53999991002',
      'complementary',jsonb_build_object(
        'option_id','a4000000-0000-4000-8000-000000000004',
        'occupancy_mode','day','date',%L
      )
    ))$$,
    (select primary_open from complementary_test_dates)
  ), 'complementary-only day reservation succeeds'
);
insert into complementary_reservation_tap_results select lives_ok(
  format(
    $$select public.create_public_reservation('reservation-public-slot', jsonb_build_object(
      'customer_name','Cliente Slot','customer_whatsapp','53999991003',
      'complementary',jsonb_build_object(
        'option_id','a4000000-0000-4000-8000-000000000006',
        'occupancy_mode','time_slot','date',%L,'start_time','11:00','end_time','12:00'
      )
    ))$$,
    (select slot_open from complementary_test_dates)
  ), 'complementary-only time-slot reservation succeeds'
);
insert into complementary_reservation_tap_results select lives_ok(
  format(
    $$select public.create_public_reservation('reservation-public-day', jsonb_build_object(
      'customer_name','Cliente Combinado','customer_whatsapp','53999991004',
      'primary',jsonb_build_object(
        'group_1_option_id','a4000000-0000-4000-8000-000000000001',
        'group_2_option_id','a4000000-0000-4000-8000-000000000002',
        'date',%L,'start_time','10:00','blocks',1
      ),
      'complementary',jsonb_build_object(
        'option_id','a4000000-0000-4000-8000-000000000003',
        'occupancy_mode','day','date',%L
      )
    ))$$,
    (select primary_open from complementary_test_dates),
    (select primary_open from complementary_test_dates)
  ), 'combined reservation succeeds atomically'
);
reset role;

insert into complementary_reservation_tap_results select results_eq(
  $$select count(*)::bigint from public.reservation_resources resource
    join public.reservations reservation on reservation.id = resource.reservation_id
    where reservation.customer_name = 'Cliente Day' and resource.occupancy_mode = 'day'$$,
  array[1::bigint], 'day reservation creates a complementary component'
);
insert into complementary_reservation_tap_results select results_eq(
  $$select count(*)::bigint from public.reservation_resources resource
    join public.reservations reservation on reservation.id = resource.reservation_id
    where reservation.customer_name = 'Cliente Slot' and resource.occupancy_mode = 'time_slot'$$,
  array[1::bigint], 'time-slot reservation creates a complementary component'
);
insert into complementary_reservation_tap_results select results_eq(
  $$select count(*)::bigint from public.reservations reservation
    join public.appointments appointment on appointment.reservation_id = reservation.id
    join public.reservation_resources resource on resource.reservation_id = reservation.id
    where reservation.customer_name = 'Cliente Combinado'
      and appointment.business_id = resource.business_id$$,
  array[1::bigint], 'combined components share the same reservation and tenant'
);
insert into complementary_reservation_tap_results select results_eq(
  $$select option_name_snapshot, group_name_snapshot from public.reservation_resources resource
    join public.reservations reservation on reservation.id = resource.reservation_id
    where reservation.customer_name = 'Cliente Combinado'$$,
  $$values ('Complemento A'::text, 'Complemento por dia'::text)$$,
  'complementary names come from catalog snapshots'
);

insert into public.appointments (
  business_id, group_1_option_id, group_2_option_id, customer_name,
  customer_whatsapp, appointment_date, start_time, end_time, duration_minutes, status
)
select 'a2000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000002', 'Conflito existente', '53999992001',
  conflict_primary, '09:00', '10:00', 60, 'scheduled'
from complementary_test_dates;

set local role anon;
insert into complementary_reservation_tap_results select throws_ok(
  format(
    $$select public.create_public_reservation('reservation-public-day', jsonb_build_object(
      'customer_name','Rollback Principal','customer_whatsapp','53999992002',
      'primary',jsonb_build_object(
        'group_1_option_id','a4000000-0000-4000-8000-000000000001',
        'group_2_option_id','a4000000-0000-4000-8000-000000000002',
        'date',%L,'start_time','09:00','blocks',1
      ),
      'complementary',jsonb_build_object(
        'option_id','a4000000-0000-4000-8000-000000000004','occupancy_mode','day','date',%L
      )
    ))$$,
    (select conflict_primary from complementary_test_dates),
    (select conflict_primary from complementary_test_dates)
  ), '23P01', 'reservation_primary_conflict', 'primary conflict aborts the aggregate'
);
reset role;

insert into public.reservations (id, business_id, customer_name, customer_whatsapp, source)
values ('a5000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000001', 'Ocupante final', '53999992003', 'public');
insert into public.reservation_resources (
  reservation_id, business_id, group_id, option_id, occupancy_mode,
  reservation_date, option_name_snapshot, group_name_snapshot
)
select 'a5000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000003', 'a4000000-0000-4000-8000-000000000003',
  'day', conflict_complementary, 'ignored', 'ignored'
from complementary_test_dates;

set local role anon;
insert into complementary_reservation_tap_results select throws_ok(
  format(
    $$select public.create_public_reservation('reservation-public-day', jsonb_build_object(
      'customer_name','Rollback Complementar','customer_whatsapp','53999992004',
      'primary',jsonb_build_object(
        'group_1_option_id','a4000000-0000-4000-8000-000000000001',
        'group_2_option_id','a4000000-0000-4000-8000-000000000002',
        'date',%L,'start_time','10:00','blocks',1
      ),
      'complementary',jsonb_build_object(
        'option_id','a4000000-0000-4000-8000-000000000003','occupancy_mode','day','date',%L
      )
    ))$$,
    (select conflict_complementary from complementary_test_dates),
    (select conflict_complementary from complementary_test_dates)
  ), '23P01', 'reservation_complementary_conflict', 'complementary conflict aborts the aggregate'
);
reset role;

insert into complementary_reservation_tap_results select results_eq(
  $$select count(*)::bigint from public.reservations where customer_name like 'Rollback %'$$,
  array[0::bigint], 'conflicts leave no partial reservation'
);
insert into complementary_reservation_tap_results select results_eq(
  $$select count(*)::bigint from public.appointments where customer_name like 'Rollback %'$$,
  array[0::bigint], 'conflicts leave no partial appointment'
);
insert into complementary_reservation_tap_results select results_eq(
  $$select count(*)::bigint from public.reservation_resources resource
    join public.reservations reservation on reservation.id = resource.reservation_id
    where reservation.customer_name like 'Rollback %'$$,
  array[0::bigint], 'conflicts leave no partial complementary component'
);
insert into complementary_reservation_tap_results select results_eq(
  $$select count(*)::bigint from public.resource_allocations allocation
    left join public.reservation_resources resource on resource.id = allocation.reservation_resource_id
    where resource.id is null$$,
  array[0::bigint], 'no orphan allocation is created'
);

set local role anon;
insert into complementary_reservation_tap_results select throws_ok(
  format(
    $$select public.create_public_reservation('reservation-public-day', jsonb_build_object(
      'customer_name','Tenant Cruzado','customer_whatsapp','53999993001',
      'complementary',jsonb_build_object(
        'option_id','a4000000-0000-4000-8000-000000000007','occupancy_mode','day','date',%L
      )
    ))$$,
    (select primary_open from complementary_test_dates)
  ), '22023', 'reservation_complementary_option_invalid', 'cross-tenant option is rejected'
);
insert into complementary_reservation_tap_results select throws_ok(
  format(
    $$select public.create_public_reservation('reservation-public-day', jsonb_build_object(
      'customer_name','Opção Inativa','customer_whatsapp','53999993002',
      'complementary',jsonb_build_object(
        'option_id','a4000000-0000-4000-8000-000000000005','occupancy_mode','day','date',%L
      )
    ))$$,
    (select primary_open from complementary_test_dates)
  ), '22023', 'reservation_complementary_option_invalid', 'inactive option is rejected'
);
insert into complementary_reservation_tap_results select throws_ok(
  format(
    $$select public.create_public_reservation('reservation-public-inactive', jsonb_build_object(
      'customer_name','Grupo Inativo','customer_whatsapp','53999993003',
      'complementary',jsonb_build_object(
        'option_id','a4000000-0000-4000-8000-000000000008','occupancy_mode','day','date',%L
      )
    ))$$,
    (select primary_open from complementary_test_dates)
  ), '22023', 'reservation_complementary_unavailable', 'inactive complementary group is rejected'
);
insert into complementary_reservation_tap_results select throws_ok(
  format(
    $$select public.create_public_reservation('reservation-public-day', jsonb_build_object(
      'customer_name','Dia Fechado','customer_whatsapp','53999993004',
      'complementary',jsonb_build_object(
        'option_id','a4000000-0000-4000-8000-000000000004','occupancy_mode','day','date',%L
      )
    ))$$,
    (select day_closed from complementary_test_dates)
  ), '22023', 'reservation_outside_business_hours', 'closed public day is rejected'
);
insert into complementary_reservation_tap_results select throws_ok(
  $$select public.create_public_reservation('reservation-public-day', '{"unexpected":true}'::jsonb)$$,
  '22023', 'reservation_payload_invalid', 'invalid payload is rejected predictably'
);
insert into complementary_reservation_tap_results select throws_ok(
  $$select count(*) from public.resource_allocations$$,
  '42501', null, 'anonymous callers cannot read allocations directly'
);
insert into complementary_reservation_tap_results select results_eq(
  format(
    $$select array_agg(key order by key) from jsonb_object_keys(
      public.create_public_reservation('reservation-public-day', jsonb_build_object(
        'customer_name','Payload Curado','customer_whatsapp','53999993005',
        'complementary',jsonb_build_object(
          'option_id','a4000000-0000-4000-8000-000000000004','occupancy_mode','day','date',%L
        )
      )
    )) as key$$,
    (select conflict_primary from complementary_test_dates)
  ),
  $$values (array['business','complementary','customer_name','date','primary','reservation_id']::text[])$$,
  'public creation returns only the curated aggregate payload'
);
reset role;

insert into complementary_reservation_tap_results select * from finish();
select result from complementary_reservation_tap_results;
rollback;
