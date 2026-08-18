begin;

create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('70000000-0000-4000-8000-000000000001', 'visual-owner@example.test', '{"name":"Visual Owner"}'),
  ('70000000-0000-4000-8000-000000000002', 'visual-admin@example.test', '{"name":"Visual Admin"}');

insert into public.businesses (id, name, slug)
values ('71000000-0000-4000-8000-000000000001', 'Arena Visual', 'arena-visual');

insert into public.business_members (business_id, user_id, role)
values
  ('71000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', 'owner'),
  ('71000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000002', 'admin');

insert into public.business_settings (business_id)
values ('71000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"70000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$update public.businesses set
    address = 'Rua Central, 100',
    google_maps_url = 'https://maps.google.com/?q=arena',
    instagram_url = 'https://instagram.com/arena',
    facebook_url = 'https://facebook.com/arena'
  where id = '71000000-0000-4000-8000-000000000001'$$,
  'owner can update the curated public contact fields'
);

select results_eq(
  $$select address, instagram_url from public.businesses where id = '71000000-0000-4000-8000-000000000001'$$,
  $$values ('Rua Central, 100'::text, 'https://instagram.com/arena'::text)$$,
  'owner reads the saved public contact fields'
);

select throws_ok(
  $$update public.businesses set active = false where id = '71000000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'business members still cannot update active directly'
);

select throws_ok(
  $$update public.businesses set instagram_url = 'javascript:alert(1)' where id = '71000000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'the database rejects unsafe public URLs'
);

select set_config('request.jwt.claims', '{"sub":"70000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select lives_ok(
  $$update public.businesses set address = 'Avenida Atualizada, 20' where id = '71000000-0000-4000-8000-000000000001'$$,
  'business admin can update public contact fields'
);

select results_eq(
  $$select theme_preference::text from public.business_settings where business_id = '71000000-0000-4000-8000-000000000001'$$,
  array['light'::text],
  'new business settings default to light theme'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select results_eq(
  $$select array[
    public.get_public_booking_page('arena-visual') #>> '{business,address}',
    public.get_public_booking_page('arena-visual') #>> '{business,google_maps_url}',
    public.get_public_booking_page('arena-visual') #>> '{business,instagram_url}',
    public.get_public_booking_page('arena-visual') #>> '{business,facebook_url}'
  ]$$,
  $$values (array['Avenida Atualizada, 20', 'https://maps.google.com/?q=arena', 'https://instagram.com/arena', 'https://facebook.com/arena']::text[])$$,
  'the anonymous RPC returns only the curated new public fields'
);

select results_eq(
  $$select not ((public.get_public_booking_page('arena-visual') -> 'business') ?| array['active', 'created_at', 'updated_at'])$$,
  array[true],
  'the anonymous RPC does not expose administrative business fields'
);

select throws_ok(
  'select * from public.businesses',
  '42501',
  null,
  'anonymous users still cannot query businesses directly'
);

select * from finish();
rollback;
