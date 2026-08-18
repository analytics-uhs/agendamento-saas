-- Development-only catalog data. No Auth user or credential is created here.
-- Associate a real local Auth user later through business_members, or create a
-- fresh business through the authenticated onboarding RPC.

insert into public.businesses (id, name, slug, whatsapp, active)
values (
  '10000000-0000-4000-8000-000000000001',
  'Arena Central',
  'arena-central',
  '(51) 99999-0000',
  true
)
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  whatsapp = excluded.whatsapp,
  active = excluded.active;

insert into public.booking_groups (
  id, business_id, position, label, active, required, sort_order
)
values
  ('11000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 1, 'Quadra', true, true, 1),
  ('11000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 2, 'Esporte', true, true, 2)
on conflict (id) do update set
  label = excluded.label,
  active = excluded.active,
  required = excluded.required,
  sort_order = excluded.sort_order;

insert into public.booking_options (
  id, business_id, group_id, name, duration_minutes, active, sort_order
)
values
  ('12000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 'Quadra 1', null, true, 1),
  ('12000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 'Quadra 2', null, true, 2),
  ('12000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000002', 'Futevôlei', 60, true, 1),
  ('12000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000002', 'Beach Tennis', 60, true, 2)
on conflict (id) do update set
  name = excluded.name,
  duration_minutes = excluded.duration_minutes,
  active = excluded.active,
  sort_order = excluded.sort_order;

insert into public.business_hours (
  business_id, weekday, active, start_time, end_time
)
select
  '10000000-0000-4000-8000-000000000001',
  weekday,
  weekday between 1 and 6,
  case when weekday = 6 then '09:00'::time else '08:00'::time end,
  case when weekday = 6 then '14:00'::time else '22:00'::time end
from generate_series(0, 6) as weekday
on conflict (business_id, weekday) do update set
  active = excluded.active,
  start_time = excluded.start_time,
  end_time = excluded.end_time;

insert into public.business_settings (
  business_id,
  duration_mode,
  fixed_duration_minutes,
  allow_multiple_blocks,
  palette,
  theme_preference
)
values (
  '10000000-0000-4000-8000-000000000001',
  'fixed_multiple',
  60,
  true,
  '{"id":"original","primary":"#E3613D","accent":"#F0BA40"}'::jsonb,
  'light'
)
on conflict (business_id) do update set
  duration_mode = excluded.duration_mode,
  fixed_duration_minutes = excluded.fixed_duration_minutes,
  allow_multiple_blocks = excluded.allow_multiple_blocks,
  palette = excluded.palette,
  theme_preference = excluded.theme_preference;
