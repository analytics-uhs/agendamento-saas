begin;
create extension if not exists pgtap with schema extensions;
create temp table module_results(result text);
grant select,insert on module_results to authenticated,anon;
insert into module_results select no_plan();
insert into auth.users(id,email) values
 ('ae680000-0000-4000-8000-000000000001','module-platform@example.test'),
 ('ae680000-0000-4000-8000-000000000002','module-owner@example.test'),
 ('ae680000-0000-4000-8000-000000000003','module-admin@example.test');
insert into private.platform_admins(user_id) values('ae680000-0000-4000-8000-000000000001');
insert into public.businesses(id,name,slug) values
 ('be680000-0000-4000-8000-000000000001','Modules A','modules-68-a'),
 ('be680000-0000-4000-8000-000000000002','Modules B','modules-68-b');
insert into public.business_members(business_id,user_id,role) values
 ('be680000-0000-4000-8000-000000000001','ae680000-0000-4000-8000-000000000002','owner'),
 ('be680000-0000-4000-8000-000000000001','ae680000-0000-4000-8000-000000000003','admin');
update public.business_modules set enabled=true where business_id='be680000-0000-4000-8000-000000000001';
insert into public.products(id,business_id,name,sale_price) values('de680000-0000-4000-8000-000000000001','be680000-0000-4000-8000-000000000001','Module product',10);
insert into public.sales(id,business_id,payment_method) values('ce680000-0000-4000-8000-000000000001','be680000-0000-4000-8000-000000000001','pix');
insert into public.sale_items(business_id,sale_id,product_id,quantity,unit_price) values('be680000-0000-4000-8000-000000000001','ce680000-0000-4000-8000-000000000001','de680000-0000-4000-8000-000000000001',1,10);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ae680000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.complete_admin_sale('ce680000-0000-4000-8000-000000000001');
select public.prepare_admin_fiscal_document('be680000-0000-4000-8000-000000000001','ce680000-0000-4000-8000-000000000001');
insert into module_results select throws_ok($$select public.set_platform_business_module_enabled('be680000-0000-4000-8000-000000000001','management',false)$$,'42501','platform_admin_forbidden','owner cannot change own modules');
insert into module_results select throws_ok($$select public.set_platform_business_module_enabled('be680000-0000-4000-8000-000000000002','fiscal',true)$$,'42501','platform_admin_forbidden','tenant A cannot change B');
insert into module_results select throws_ok($$select public.get_platform_business_modules('be680000-0000-4000-8000-000000000002')$$,'42501','platform_admin_forbidden','ordinary member cannot use platform read RPC');
insert into module_results select throws_ok($$update public.business_modules set enabled=false where business_id='be680000-0000-4000-8000-000000000001'$$,'42501',null,'no direct update');
select set_config('request.jwt.claims','{"sub":"ae680000-0000-4000-8000-000000000003","role":"authenticated"}',true);
insert into module_results select throws_ok($$select public.set_platform_business_module_enabled('be680000-0000-4000-8000-000000000001','fiscal',false)$$,'42501','platform_admin_forbidden','business admin cannot change modules');
reset role;
create function pg_temp.domain_snapshot() returns jsonb language sql as $$
 select jsonb_build_object(
 'products',(select jsonb_agg(to_jsonb(t) order by id) from public.products t where business_id='be680000-0000-4000-8000-000000000001'),
 'sales',(select jsonb_agg(to_jsonb(t) order by id) from public.sales t where business_id='be680000-0000-4000-8000-000000000001'),
 'items',(select jsonb_agg(to_jsonb(t) order by id) from public.sale_items t where business_id='be680000-0000-4000-8000-000000000001'),
 'stock',(select jsonb_agg(to_jsonb(t) order by id) from public.stock_movements t where business_id='be680000-0000-4000-8000-000000000001'),
 'financial',(select jsonb_agg(to_jsonb(t) order by id) from public.financial_entries t where business_id='be680000-0000-4000-8000-000000000001'),
 'fiscal',(select jsonb_agg(to_jsonb(t) order by id) from public.fiscal_documents t where business_id='be680000-0000-4000-8000-000000000001'));
$$;
create temp table before_modules as select pg_temp.domain_snapshot() as snapshot;
delete from public.business_modules where business_id='be680000-0000-4000-8000-000000000001' and module='fiscal';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ae680000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into module_results select is(jsonb_array_length(public.get_platform_business_modules('be680000-0000-4000-8000-000000000001')),2,'platform reads actual missing-row state without membership');
insert into module_results select is(public.set_platform_business_module_enabled('be680000-0000-4000-8000-000000000001','management',false)->>'enabled','false','platform disables management');
insert into module_results select is(public.set_platform_business_module_enabled('be680000-0000-4000-8000-000000000001','fiscal',true)->>'enabled','true','platform upserts fiscal');
select public.set_platform_business_module_enabled('be680000-0000-4000-8000-000000000001','fiscal',true);
insert into module_results select is(jsonb_array_length(public.get_platform_business_modules('be680000-0000-4000-8000-000000000001')),3,'repeated upsert creates no duplicate');
insert into module_results select throws_ok($$select public.set_platform_business_module_enabled('be680000-0000-4000-8000-000000000001','ERP',true)$$,'22023','platform_admin_invalid_module','unknown module rejected');
insert into module_results select throws_ok($$select public.set_platform_business_module_enabled('be680000-0000-4000-8000-000000000001','management',null)$$,'22023','platform_admin_invalid_module','null state rejected');
insert into module_results select throws_ok($$select public.set_platform_business_module_enabled('be680000-0000-4000-8000-000000000099','fiscal',true)$$,'P0002','platform_admin_business_not_found','nonexistent business rejected');
insert into module_results select throws_ok($$select public.set_platform_business_module_enabled('be680000-0000-4000-8000-000000000001','scheduling',false)$$,'22023','platform_admin_scheduling_required','scheduling cannot be disabled even via RPC');
select public.set_platform_business_module_enabled('be680000-0000-4000-8000-000000000001','fiscal',false);
reset role;
insert into module_results select is(pg_temp.domain_snapshot(),(select snapshot from before_modules),'disabling modules does not modify products/sales/stock/financial/fiscal data');
insert into module_results select is((select count(*) from public.business_modules where business_id='be680000-0000-4000-8000-000000000002' and enabled),1::bigint,'other tenant remains at defaults');
insert into module_results select is((select updated_by from public.business_modules where business_id='be680000-0000-4000-8000-000000000001' and module='management'),'ae680000-0000-4000-8000-000000000001'::uuid,'last actor recorded');
insert into module_results select ok((select updated_at=now() from public.business_modules where business_id='be680000-0000-4000-8000-000000000001' and module='management'),'timestamp updated');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ae680000-0000-4000-8000-000000000002","role":"authenticated"}',true);
insert into module_results select is((select count(*) from public.business_modules),3::bigint,'member still reads own modules only');
insert into module_results select is((select enabled from public.business_modules where module='management'),false,'member immediately reads disabled state');
insert into module_results select is((select count(*) from public.products where business_id='be680000-0000-4000-8000-000000000001'),0::bigint,'disabled management still enforces domain RLS');
select set_config('request.jwt.claims','{"sub":"ae680000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into module_results select is(public.set_platform_business_module_enabled('be680000-0000-4000-8000-000000000001','management',true)->>'enabled','true','platform enables management');
select set_config('request.jwt.claims','{"sub":"ae680000-0000-4000-8000-000000000002","role":"authenticated"}',true);
insert into module_results select is((select count(*) from public.products where business_id='be680000-0000-4000-8000-000000000001'),1::bigint,'reactivation restores access to existing data');
reset role;
delete from public.business_modules where business_id='be680000-0000-4000-8000-000000000001' and module='scheduling';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ae680000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into module_results select is(public.set_platform_business_module_enabled('be680000-0000-4000-8000-000000000001','scheduling',true)->>'enabled','true','missing scheduling can be restored');
reset role;
insert into module_results select ok(not has_table_privilege('authenticated','public.business_modules','INSERT,UPDATE,DELETE'),'no generic write grant introduced');
set local role anon;
insert into module_results select throws_ok($$select public.set_platform_business_module_enabled('be680000-0000-4000-8000-000000000001','fiscal',true)$$,'42501',null,'anon cannot mutate');
insert into module_results select throws_ok($$select public.get_platform_business_modules('be680000-0000-4000-8000-000000000001')$$,'42501',null,'anon cannot read platform modules');
reset role;
insert into module_results select * from finish();
select result from module_results;
rollback;
