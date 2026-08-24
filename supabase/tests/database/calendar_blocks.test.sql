begin;

create extension if not exists pgtap with schema extensions;
select plan(28);

create function pg_temp.next_monday()
returns date language sql stable as $$
  select current_date + case when extract(dow from current_date)::integer = 1 then 7
    else (8 - extract(dow from current_date)::integer) % 7 end
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('b0000000-0000-4000-8000-000000000001', 'blocks-owner@example.test', '{"name":"Owner"}'),
  ('b0000000-0000-4000-8000-000000000002', 'blocks-admin@example.test', '{"name":"Admin"}'),
  ('b0000000-0000-4000-8000-000000000003', 'blocks-other@example.test', '{"name":"Other"}');
insert into public.businesses (id, name, slug) values
  ('b1000000-0000-4000-8000-000000000001', 'Blocks Business', 'blocks-business'),
  ('b1000000-0000-4000-8000-000000000002', 'Other Blocks', 'other-blocks');
insert into public.business_members (business_id, user_id, role) values
  ('b1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'owner'),
  ('b1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'admin'),
  ('b1000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000003', 'owner');
insert into public.business_settings (business_id, duration_mode, fixed_duration_minutes, allow_multiple_blocks)
values ('b1000000-0000-4000-8000-000000000001', 'fixed', 60, false),
       ('b1000000-0000-4000-8000-000000000002', 'fixed', 60, false);
insert into public.booking_groups (id, business_id, position, label, active) values
  ('b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 1, 'Recurso', true);
insert into public.booking_options (id, business_id, group_id, name, active, sort_order) values
  ('b3000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'Recurso A', true, 0),
  ('b3000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'Recurso B', true, 1);
insert into public.business_hours (business_id, weekday, active, start_time, end_time) values
  ('b1000000-0000-4000-8000-000000000001', 1, true, '08:00', '20:00'),
  ('b1000000-0000-4000-8000-000000000002', 1, true, '08:00', '20:00');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(format($$select public.create_calendar_blocks(array['b3000000-0000-4000-8000-000000000001']::uuid[], %L, '09:00', '11:00', 'Manutenção', false, null)$$, pg_temp.next_monday()), 'owner creates a block');
select is((select count(*)::integer from public.calendar_blocks where reason = 'Manutenção'), 1, 'block is persisted as its own entity');
select throws_ok(format($$insert into public.calendar_blocks (business_id, group_1_option_id, block_date, start_time, end_time) values ('b1000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001',%L,'19:00','20:00')$$, pg_temp.next_monday()), '42501', null, 'authenticated users cannot mutate blocks directly');
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select lives_ok(format($$select public.create_calendar_blocks(array['b3000000-0000-4000-8000-000000000001']::uuid[], %L, '19:00', '20:00', 'Admin', false, null)$$, pg_temp.next_monday()), 'admin creates a block through the controlled RPC');
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*)::integer from jsonb_array_elements(public.get_booking_availability('blocks-business', pg_temp.next_monday(), 'b3000000-0000-4000-8000-000000000001', null)) slot where slot->>'start_time' in ('09:00','10:00')), 0, 'public availability removes blocked slots');
select is((select count(*)::integer from jsonb_array_elements(public.get_booking_availability('blocks-business', pg_temp.next_monday(), 'b3000000-0000-4000-8000-000000000002', null)) slot where slot->>'start_time' = '09:00'), 1, 'a different Group 1 resource stays available');
select throws_ok(format($$select public.create_admin_appointment('b3000000-0000-4000-8000-000000000001',null,%L,'09:00',1,'Blocked Client','11999990001')$$, pg_temp.next_monday()), '23P01', null, 'admin booking cannot overlap a block');
select lives_ok(format($$select public.create_admin_appointment('b3000000-0000-4000-8000-000000000002',null,%L,'09:00',1,'Other Resource','11999990002')$$, pg_temp.next_monday()), 'admin booking can use another resource');
select throws_ok(format($$select public.create_calendar_blocks(array['b3000000-0000-4000-8000-000000000002']::uuid[], %L, '09:00', '10:00', null, false, null)$$, pg_temp.next_monday()), '23P01', null, 'block creation detects an existing appointment');
select throws_ok(format($$select public.create_calendar_blocks(array['b3000000-0000-4000-8000-000000000001']::uuid[], %L, '10:00', '12:00', null, false, null)$$, pg_temp.next_monday()), '23P01', null, 'overlapping blocks are rejected');
select lives_ok(format($$select public.create_calendar_blocks(array['b3000000-0000-4000-8000-000000000001']::uuid[], %L, '11:00', '12:00', null, false, null)$$, pg_temp.next_monday()), 'adjacent blocks are allowed');
select lives_ok(format($$select public.update_calendar_block((select id from public.calendar_blocks where start_time = '11:00' and series_id is null limit 1), %L, '13:00', '14:00', 'Ajustado')$$, pg_temp.next_monday()), 'a single block can be edited through the controlled RPC');
select is((select count(*)::integer from public.calendar_blocks where reason = 'Ajustado' and start_time = '13:00'), 1, 'block editing persists the new interval and reason');
select lives_ok(format($$select public.create_calendar_blocks(array['b3000000-0000-4000-8000-000000000001']::uuid[], %L, '14:00', '15:00', 'Semanal', true, 3)$$, pg_temp.next_monday()), 'limited weekly block series is created');
select is((select count(*)::integer from public.calendar_blocks where reason = 'Semanal'), 3, 'limited recurrence creates the exact repeat count');
select lives_ok($$select public.materialize_calendar_blocks((select id from public.calendar_block_series where reason = 'Semanal'), null)$$, 'materialization is idempotent');
select is((select count(*)::integer from public.calendar_blocks where reason = 'Semanal'), 3, 'idempotent materialization does not duplicate');
select lives_ok(format($$select public.create_calendar_blocks(array['b3000000-0000-4000-8000-000000000002']::uuid[], %L, '16:00', '17:00', 'Permanente', true, null)$$, pg_temp.next_monday()), 'permanent weekly block series is created');
select ok((select max(block_date) <= current_date + 90 from public.calendar_blocks where reason = 'Permanente'), 'permanent recurrence respects the 90-day horizon');
select lives_ok($$select public.delete_calendar_block((select id from public.calendar_blocks where reason = 'Semanal' order by block_date limit 1), 'single')$$, 'one recurring occurrence can be removed');
select is((select count(*)::integer from public.calendar_blocks where reason = 'Semanal' and cancelled_at is null), 2, 'single removal preserves future occurrences');
select lives_ok($$select public.delete_calendar_block((select id from public.calendar_blocks where reason = 'Semanal' and cancelled_at is null order by block_date limit 1), 'future')$$, 'current and future occurrences can be removed');

select lives_ok(format($$select public.create_calendar_blocks(array['b3000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000002']::uuid[], %L, '12:00', '13:00', 'Todos', false, null)$$, pg_temp.next_monday()), 'one action can block every selected Group 1 resource');
select is((select count(*)::integer from public.calendar_blocks where reason = 'Todos'), 2, 'select-all persists one normalized block per resource');
update public.booking_groups set active = false where id = 'b2000000-0000-4000-8000-000000000001';
select lives_ok(format($$select public.create_calendar_blocks(array[]::uuid[], %L, '18:00', '19:00', 'Agenda inteira', false, null)$$, pg_temp.next_monday()), 'without Group 1 the business is blocked as one resource');
select throws_ok(format($$select public.create_admin_appointment(null,null,%L,'18:00',1,'Whole Business','11999990003')$$, pg_temp.next_monday()), '23P01', 'booking_conflict', 'business-wide block prevents a booking when Group 1 is inactive');

select set_config('request.jwt.claims', '{"sub":"b0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is_empty($$select id from public.calendar_blocks where business_id = 'b1000000-0000-4000-8000-000000000001'$$, 'another tenant cannot read blocks');
select throws_ok(format($$select public.create_calendar_blocks(array['b3000000-0000-4000-8000-000000000001']::uuid[], %L, '18:00', '19:00', null, false, null)$$, pg_temp.next_monday()), '22023', 'calendar_block_invalid_resource', 'another tenant cannot create a block for this business resource');

select * from finish();
rollback;
