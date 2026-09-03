begin;
create extension if not exists pgtap with schema extensions;
create temp table modules_results(result text);
grant select, insert on modules_results to anon, authenticated;
insert into modules_results select plan(16);

insert into modules_results select is(
  (select count(*) from public.businesses b where
    (select count(*) from public.business_modules m where m.business_id=b.id) <> 3),
  0::bigint, 'backfill covers all existing businesses');
insert into modules_results select is(
  (select count(*) from public.business_modules where enabled <> (module='scheduling')),
  0::bigint, 'initial migration defaults: scheduling on, management and fiscal off');

insert into auth.users(id,email) values
('a9300000-0000-4000-8000-000000000001','modules-owner@example.test'),
('a9300000-0000-4000-8000-000000000002','modules-admin@example.test');
insert into public.businesses(id,name,slug) values
('b9300000-0000-4000-8000-000000000001','Modules A','test-modules-a'),
('b9300000-0000-4000-8000-000000000002','Modules B','test-modules-b');
insert into public.business_members(business_id,user_id,role) values
('b9300000-0000-4000-8000-000000000001','a9300000-0000-4000-8000-000000000001','owner'),
('b9300000-0000-4000-8000-000000000001','a9300000-0000-4000-8000-000000000002','admin');
insert into modules_results select results_eq(
  $$select module,enabled from public.business_modules where business_id='b9300000-0000-4000-8000-000000000001' order by module$$,
  $$values ('fiscal'::text,false),('management'::text,false),('scheduling'::text,true)$$,
  'new businesses receive the same three defaults');
insert into modules_results select throws_ok(
  $$insert into public.business_modules(business_id,module) values ('b9300000-0000-4000-8000-000000000001','scheduling')$$,
  '23505',null,'business/module is unique');
insert into modules_results select throws_ok(
  $$insert into public.business_modules(business_id,module) values ('b9300000-0000-4000-8000-000000000001','unknown')$$,
  '23514',null,'invalid modules rejected');
insert into modules_results select ok(
  (select relrowsecurity from pg_class where oid='public.business_modules'::regclass), 'RLS enabled');
insert into modules_results select ok(
  not has_table_privilege('authenticated','public.business_modules','INSERT,UPDATE,DELETE')
  and not has_table_privilege('service_role','public.business_modules','SELECT,INSERT,UPDATE,DELETE'),
  'no client or service role write surface');
insert into modules_results select ok(
  not has_function_privilege('authenticated','private.initialize_business_modules()','EXECUTE')
  and not has_function_privilege('anon','private.initialize_business_modules()','EXECUTE'),
  'initializer is private');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a9300000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into modules_results select is((select count(*) from public.business_modules),3::bigint,'owner sees only own three modules');
insert into modules_results select is((select count(*) from public.business_modules where business_id='b9300000-0000-4000-8000-000000000002'),0::bigint,'other tenant is invisible');
insert into modules_results select throws_ok($$update public.business_modules set enabled=true where module='management'$$,'42501',null,'owner cannot enable paid module');
insert into modules_results select throws_ok($$update public.business_modules set enabled=true where business_id='b9300000-0000-4000-8000-000000000002'$$,'42501',null,'cross-tenant write denied');
select set_config('request.jwt.claims','{"sub":"a9300000-0000-4000-8000-000000000002","role":"authenticated"}',true);
insert into modules_results select is((select count(*) from public.business_modules),3::bigint,'admin can read own configuration');
insert into modules_results select throws_ok($$update public.business_modules set enabled=true where module='fiscal'$$,'42501',null,'admin cannot enable fiscal');
reset role;
set local role anon;
insert into modules_results select throws_ok($$select * from public.business_modules$$,'42501',null,'anon has no read access');
insert into modules_results select throws_ok($$insert into public.business_modules(business_id,module) values ('b9300000-0000-4000-8000-000000000001','management')$$,'42501',null,'anon has no write access');
reset role;
insert into modules_results select * from finish();
select result from modules_results;
rollback;
