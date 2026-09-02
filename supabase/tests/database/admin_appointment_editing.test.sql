begin;

create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, email, raw_user_meta_data) values
  ('71000000-0000-4000-8000-000000000001', 'edit-owner@example.test', '{"name":"Edit Owner"}'),
  ('71000000-0000-4000-8000-000000000002', 'edit-other@example.test', '{"name":"Other Owner"}');
insert into public.businesses (id, name, slug) values
  ('71100000-0000-4000-8000-000000000001', 'Edit Test', 'edit-test'),
  ('71100000-0000-4000-8000-000000000002', 'Other Edit Test', 'other-edit-test');
insert into public.business_members (business_id, user_id, role) values
  ('71100000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', 'owner'),
  ('71100000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000002', 'owner');
insert into public.business_settings (business_id, duration_mode, fixed_duration_minutes, allow_multiple_blocks) values
  ('71100000-0000-4000-8000-000000000001', 'fixed_multiple', 30, true),
  ('71100000-0000-4000-8000-000000000002', 'fixed', 30, false);
insert into public.business_hours (business_id, weekday, active, start_time, end_time)
select '71100000-0000-4000-8000-000000000001', weekday, true, '08:00', '18:00' from generate_series(0, 6) weekdays(weekday);
insert into public.appointment_series (id, business_id, customer_name, customer_whatsapp, weekday, start_time, duration_minutes, blocks, starts_on, active, created_by)
values ('71200000-0000-4000-8000-000000000001', '71100000-0000-4000-8000-000000000001', 'Recurring', '5553999999999', extract(dow from current_date + 30), '09:00', 30, 1, current_date + 30, true, '71000000-0000-4000-8000-000000000001');
-- Synthetic recurring fixture follows the same authorized series context as materialization.
select set_config('request.jwt.claims', '{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('app.appointment_series_id', '71200000-0000-4000-8000-000000000001', true);
insert into public.appointments (id, business_id, customer_name, customer_whatsapp, appointment_date, start_time, end_time, duration_minutes, status, series_id) values
  ('71300000-0000-4000-8000-000000000001', '71100000-0000-4000-8000-000000000001', 'Recurring', '5553999999999', current_date + 30, '09:00', '09:30', 30, 'scheduled', '71200000-0000-4000-8000-000000000001');
select set_config('app.appointment_series_id', '', true);
insert into public.appointments (id, business_id, customer_name, customer_whatsapp, appointment_date, start_time, end_time, duration_minutes, status, series_id) values
  ('71300000-0000-4000-8000-000000000002', '71100000-0000-4000-8000-000000000001', 'Occupied', '5553999999998', current_date + 30, '11:00', '11:30', 30, 'scheduled', null);

create function pg_temp.reject_temporary_cancellation()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'scheduled' and new.status = 'cancelled' then
    raise exception 'editing_must_not_cancel_the_appointment';
  end if;
  return new;
end;
$$;
create trigger reject_temporary_cancellation
before update of status on public.appointments
for each row execute function pg_temp.reject_temporary_cancellation();

select has_function('public', 'update_admin_appointment_occurrence', array['uuid','uuid','uuid','date','time without time zone','integer','text','text'], 'editing uses a dedicated RPC');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select results_eq(
  $$select item->>'start_time', (item->>'max_blocks')::integer
    from jsonb_array_elements(public.get_admin_appointment_edit_availability(
      '71300000-0000-4000-8000-000000000001', current_date + 30, null, null
    )) item
    where item->>'start_time' = '09:00'$$,
  $$values ('09:00'::text, 4)$$,
  'edit availability includes the current start and full fixed_multiple sequence'
);
select lives_ok($$select public.update_admin_appointment_occurrence('71300000-0000-4000-8000-000000000001', null, null, current_date + 30, '09:00', 1, 'Recurring', '5553999999999')$$, 'saving without changing the schedule works');
select lives_ok($$select public.update_admin_appointment_occurrence('71300000-0000-4000-8000-000000000001', null, null, current_date + 30, '09:00', 1, 'Renamed Only', '(53) 99999-2222')$$, 'name and WhatsApp can change without moving the occurrence');
select results_eq($$select customer_name, customer_whatsapp from public.appointments where id = '71300000-0000-4000-8000-000000000001'$$, $$values ('Renamed Only'::text, '53999992222'::text)$$, 'non-schedule fields are normalized and persisted');
select lives_ok($$select public.update_admin_appointment_occurrence('71300000-0000-4000-8000-000000000001', null, null, current_date + 31, '10:00', 2, 'Edited Name', '(53) 99999-1111')$$, 'owner edits one occurrence');
select results_eq($$select customer_name, start_time::text, duration_minutes from public.appointments where id = '71300000-0000-4000-8000-000000000001'$$, $$values ('Edited Name'::text, '10:00:00'::text, 60)$$, 'edit persists validated fields and blocks');
select results_eq($$select series_id::text from public.appointments where id = '71300000-0000-4000-8000-000000000001'$$, array['71200000-0000-4000-8000-000000000001'::text], 'editing an occurrence preserves its series');
select throws_ok($$select public.update_admin_appointment_occurrence('71300000-0000-4000-8000-000000000001', null, null, current_date + 30, '11:00', 1, 'Conflict', '53999991111')$$, '23P01', null, 'conflict blocks rescheduling');
select throws_ok($$update public.appointments set customer_name = 'Unsafe' where id = '71300000-0000-4000-8000-000000000001'$$, '42501', null, 'direct update remains revoked');
select set_config('request.jwt.claims', '{"sub":"71000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok($$select public.update_admin_appointment_occurrence('71300000-0000-4000-8000-000000000001', null, null, current_date + 32, '10:00', 1, 'Forbidden', '53999992222')$$, '42501', null, 'another business cannot edit the occurrence');

select * from finish();
rollback;
