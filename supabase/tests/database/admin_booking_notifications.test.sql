begin;

create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('a0000000-0000-4000-8000-000000000001', 'notification-owner@example.test', '{"name":"Notification Owner"}'),
  ('a0000000-0000-4000-8000-000000000002', 'notification-admin@example.test', '{"name":"Notification Admin"}'),
  ('a0000000-0000-4000-8000-000000000003', 'notification-other@example.test', '{"name":"Notification Other"}');

insert into public.businesses (id, name, slug)
values
  ('a1000000-0000-4000-8000-000000000001', 'Notification Business', 'notification-business'),
  ('a1000000-0000-4000-8000-000000000002', 'Notification Other', 'notification-other');

insert into public.business_members (business_id, user_id, role)
values
  ('a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'owner'),
  ('a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'admin'),
  ('a1000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000003', 'owner');

insert into public.booking_groups (id, business_id, position, label)
values
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 1, 'Selecione sua quadra'),
  ('a2000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 2, 'Qual esporte deseja?');

insert into public.booking_options (id, business_id, group_id, name)
values
  ('a3000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'Quadra frente'),
  ('a3000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002', 'Futebol');

insert into public.appointments (
  id, business_id, group_1_option_id, group_2_option_id, customer_name,
  customer_whatsapp, appointment_date, start_time, end_time, duration_minutes
) values (
  'a4000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000002',
  'João', '53999990000',
  (now() at time zone 'America/Sao_Paulo')::date + 1,
  '18:00', '19:00', 60
);

select results_eq(
  $$select count(*)::bigint from public.admin_notifications
    where appointment_id = 'a4000000-0000-4000-8000-000000000001'$$,
  array[2::bigint],
  'a public appointment creates one notification for each owner/admin'
);

select results_eq(
  $$select distinct title from public.admin_notifications
    where appointment_id = 'a4000000-0000-4000-8000-000000000001'$$,
  array['Novo agendamento'::text],
  'the internal notification has the expected title'
);

select results_eq(
  $$select distinct message from public.admin_notifications
    where appointment_id = 'a4000000-0000-4000-8000-000000000001'$$,
  array['João agendou Quadra frente · Futebol para amanhã às 18:00.'::text],
  'the message uses option names, tomorrow, and never group labels'
);

select ok(
  not exists (
    select 1 from public.admin_notifications
    where message like '%Selecione sua quadra%'
       or message like '%Qual esporte deseja%'
  ),
  'configurable labels never enter notification messages'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select results_eq(
  'select count(*)::bigint from public.admin_notifications',
  array[1::bigint],
  'the owner sees only their own recipient row'
);

select results_eq(
  'select count(*)::bigint from public.admin_notifications where read_at is null',
  array[1::bigint],
  'the unread counter starts at one for the owner'
);

select lives_ok(
  $$select public.mark_admin_notification_read(
    (select id from public.admin_notifications limit 1)
  )$$,
  'the owner can mark their notification as read'
);

select results_eq(
  'select count(*)::bigint from public.admin_notifications where read_at is null',
  array[0::bigint],
  'marking as read updates the unread counter'
);

select lives_ok(
  $$select public.save_push_subscription(
    'a1000000-0000-4000-8000-000000000001',
    'https://push.example.test/subscription-owner',
    'valid-p256dh-key-material',
    'valid-auth-key',
    'pgTAP browser'
  )$$,
  'a business owner can save their own push subscription'
);

select lives_ok(
  $$select public.save_push_subscription(
    'a1000000-0000-4000-8000-000000000001',
    'https://push.example.test/subscription-owner',
    'updated-p256dh-key-material',
    'updated-auth-key',
    'pgTAP browser updated'
  )$$,
  'saving the same endpoint updates idempotently'
);

select results_eq(
  $$select count(*)::bigint from public.push_subscriptions
    where endpoint = 'https://push.example.test/subscription-owner'$$,
  array[1::bigint],
  'duplicate endpoints are not created'
);

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select results_eq(
  'select count(*)::bigint from public.admin_notifications',
  array[1::bigint],
  'the admin receives their own notification row'
);

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);

select results_eq(
  'select count(*)::bigint from public.admin_notifications',
  array[0::bigint],
  'a user from another business cannot read notifications'
);

select throws_ok(
  $$select public.mark_admin_notification_read(
    (select id from public.admin_notifications where false)
  )$$,
  '42501', null,
  'a user from another business cannot mark a notification as read'
);

select throws_ok(
  $$select public.save_push_subscription(
    'a1000000-0000-4000-8000-000000000002',
    'https://push.example.test/subscription-owner',
    'other-p256dh-key-material',
    'other-auth-key',
    null
  )$$,
  '42501', null,
  'another user cannot take over an existing endpoint'
);

reset role;
select set_config('app.appointment_source', 'admin', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

insert into public.appointments (
  id, business_id, customer_name, customer_whatsapp, appointment_date,
  start_time, end_time, duration_minutes
) values (
  'a4000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000001',
  'Manual Customer', '53999990001', current_date + 2, '20:00', '21:00', 60
);

reset role;
select results_eq(
  $$select count(*)::bigint from public.admin_notifications
    where appointment_id = 'a4000000-0000-4000-8000-000000000002'$$,
  array[0::bigint],
  'admin-created appointments do not generate notifications'
);

set local role service_role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000000","role":"service_role"}', true);

select results_eq(
  $$select count(*)::bigint from public.claim_pending_admin_push_notifications('notification-business')$$,
  array[2::bigint],
  'the service role can claim pending push notifications'
);

select results_eq(
  $$select count(*)::bigint from public.admin_notifications where push_dispatched_at is null$$,
  array[0::bigint],
  'claiming the queue records the dispatch attempt'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$select public.remove_push_subscription('https://push.example.test/subscription-owner')$$,
  'the owner can remove their own subscription'
);

select results_eq(
  $$select count(*)::bigint from public.push_subscriptions
    where endpoint = 'https://push.example.test/subscription-owner'$$,
  array[0::bigint],
  'removing a subscription deletes the endpoint'
);

select * from finish();
rollback;
