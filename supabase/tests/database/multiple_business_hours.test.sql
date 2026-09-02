begin;

create extension if not exists pgtap with schema extensions;
select plan(18);

create function pg_temp.next_monday()
returns date
language sql
stable
as $$
  select current_date + case
    when extract(dow from current_date)::integer = 1 then 7
    else (8 - extract(dow from current_date)::integer) % 7
  end
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-4000-8000-000000000001', 'hours-owner@example.test', '{"name":"Hours Owner"}'),
  ('a0000000-0000-4000-8000-000000000002', 'hours-other@example.test', '{"name":"Hours Other"}'),
  ('a0000000-0000-4000-8000-000000000003', 'hours-onboarding@example.test', '{"name":"Hours Onboarding"}');

insert into public.businesses (id, name, slug) values
  ('a1000000-0000-4000-8000-000000000001', 'Hours Business', 'hours-business'),
  ('a1000000-0000-4000-8000-000000000002', 'Other Hours Business', 'other-hours-business');
insert into public.business_members (business_id, user_id, role) values
  ('a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'owner'),
  ('a1000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', 'owner');
insert into public.business_settings (business_id, duration_mode, fixed_duration_minutes, allow_multiple_blocks) values
  ('a1000000-0000-4000-8000-000000000001', 'fixed', 60, false),
  ('a1000000-0000-4000-8000-000000000002', 'fixed', 60, false);
insert into public.booking_groups (id, business_id, position, label, active) values
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 1, 'Recurso', false),
  ('a2000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 2, 'Serviço', false);
insert into public.booking_options (id, business_id, group_id, name, duration_minutes, active) values
  ('a3000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002', 'Sessão longa', 90, true);
insert into public.business_hours (business_id, weekday, active, start_time, end_time)
values ('a1000000-0000-4000-8000-000000000001', 1, true, '08:00', '11:00');

select ok(not exists(select 1 from pg_constraint where conrelid='public.business_hours'::regclass and conname='business_hours_business_weekday_unique'), 'one row per weekday is no longer enforced');
select results_eq(
  $$select value ->> 'start_time' from jsonb_array_elements(public.get_booking_availability('hours-business', pg_temp.next_monday(), null, null)) as slot(value) order by 1$$,
  array['08:00', '09:00', '10:00'],
  'a single existing window still generates slots'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select public.replace_business_hours((select jsonb_agg(jsonb_build_object(
    'weekday', weekday,
    'active', weekday = 1,
    'windows', case when weekday = 1 then '[{"start_time":"08:00","end_time":"11:00"},{"start_time":"14:00","end_time":"20:00"}]'::jsonb else '[]'::jsonb end
  ) order by weekday) from generate_series(0, 6) as weekday))$$,
  'an owner atomically saves two windows for Monday'
);
select is((select count(*)::integer from public.business_hours where business_id = 'a1000000-0000-4000-8000-000000000001' and weekday = 1), 2, 'two normalized rows are stored for one weekday');
select results_eq(
  $$select value ->> 'start_time' from jsonb_array_elements(public.get_booking_availability('hours-business', pg_temp.next_monday(), null, null)) as slot(value) where value ->> 'start_time' in ('11:00','12:00','13:00')$$,
  array[]::text[],
  'the lunch closure produces no slots'
);
select throws_ok(format(
  $$select public.create_public_appointment('hours-business',null,null,%L::date,'10:30',1,'Cross Window','11999990001')$$,
  pg_temp.next_monday()
), '22023', 'booking_outside_business_hours', 'an appointment cannot cross a window boundary');

reset role;
update public.business_settings set duration_mode = 'fixed_multiple', allow_multiple_blocks = true where business_id = 'a1000000-0000-4000-8000-000000000001';
select is((select (value ->> 'max_blocks')::integer from jsonb_array_elements(public.get_booking_availability('hours-business', pg_temp.next_monday(), null, null)) as slot(value) where value ->> 'start_time' = '10:00'), 1, 'fixed_multiple stops at the current window closing time');

update public.business_settings set duration_mode = 'group_2', allow_multiple_blocks = false where business_id = 'a1000000-0000-4000-8000-000000000001';
update public.booking_groups set active = true where id = 'a2000000-0000-4000-8000-000000000002';
select is((select count(*)::integer from jsonb_array_elements(public.get_booking_availability('hours-business', pg_temp.next_monday(), null, 'a3000000-0000-4000-8000-000000000001')) as slot(value) where value ->> 'start_time' = '10:00'), 0, 'group_2 duration must fit entirely inside one window');

select throws_ok(
  $$insert into public.business_hours (business_id, weekday, active,start_time,end_time) values ('a1000000-0000-4000-8000-000000000001',1,true,'10:30','14:30')$$,
  '23P01', null, 'overlapping windows are rejected by the database'
);
select lives_ok(
  $$insert into public.business_hours (business_id,weekday,active,start_time,end_time) values ('a1000000-0000-4000-8000-000000000001',1,true,'11:00','14:00')$$,
  'adjacent windows are accepted'
);
select is((select jsonb_array_length(public.get_public_booking_page('hours-business') -> 'hours')), 3, 'the curated public RPC returns every active window');
delete from public.business_hours where business_id = 'a1000000-0000-4000-8000-000000000001' and weekday = 1 and start_time = '11:00' and end_time = '14:00';

update public.business_settings set duration_mode = 'fixed', fixed_duration_minutes = 60 where business_id = 'a1000000-0000-4000-8000-000000000001';
update public.booking_groups set active = false where business_id = 'a1000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(format(
  $$select public.create_recurring_appointment_series(null,null,%L::date,'09:00',1,'Window Series','11999990002',2)$$,
  pg_temp.next_monday()
), 'a recurrence inside an opening window is created');
select lives_ok(format(
  $$select public.create_recurring_appointment_series(null,null,%L::date,'12:00',1,'Lunch Series','11999990003',2)$$,
  pg_temp.next_monday()
), 'administrative recurrence preserves the outside-hours exception');

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is_empty(
  $$update public.business_hours set start_time = '07:00' where business_id = 'a1000000-0000-4000-8000-000000000001' returning id$$,
  'RLS prevents a user from another business from changing these windows'
);

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select lives_ok(
  $$select public.complete_business_onboarding(jsonb_build_object(
    'name','Multi Window Onboarding','slug','multi-window-onboarding','whatsapp','11999990004',
    'groups',jsonb_build_array(
      jsonb_build_object('position',1,'label','Grupo 1','active',false,'required',false,'options','[]'::jsonb),
      jsonb_build_object('position',2,'label','Grupo 2','active',false,'required',false,'options','[]'::jsonb)
    ),
    'hours',(select jsonb_agg(jsonb_build_object(
      'weekday',weekday,'active',weekday = 1,
      'windows',case when weekday = 1 then '[{"start_time":"08:00","end_time":"11:00"},{"start_time":"14:00","end_time":"20:00"}]'::jsonb else '[]'::jsonb end
    ) order by weekday) from generate_series(0,6) as weekday),
    'settings',jsonb_build_object('duration_mode','fixed','fixed_duration_minutes',60,'palette','{"id":"original"}'::jsonb,'theme_preference','light')
  ))$$,
  'onboarding accepts multiple windows from the first setup'
);
select is((select count(*)::integer from public.business_hours as hour join public.businesses as business on business.id = hour.business_id where business.slug = 'multi-window-onboarding' and hour.weekday = 1), 2, 'onboarding persists both windows');

reset role;
select throws_ok(
  $$insert into public.business_hours (business_id,weekday,active,start_time,end_time) values ('a1000000-0000-4000-8000-000000000001',1,true,'08:00','11:00')$$,
  '23505', null, 'duplicate windows are rejected'
);
update public.business_hours set active = false where business_id = 'a1000000-0000-4000-8000-000000000001' and weekday = 1;
select is((select jsonb_array_length(public.get_booking_availability('hours-business', pg_temp.next_monday(), null, null))), 0, 'an inactive day exposes no availability even with stored windows');

select * from finish();
rollback;
