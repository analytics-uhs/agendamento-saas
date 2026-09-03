begin;
create extension if not exists pgtap with schema extensions;
create temp table catalog_results(result text);
grant select,insert on catalog_results to authenticated,anon;
insert into catalog_results select no_plan();
insert into auth.users(id,email) values
('ac600000-0000-4000-8000-000000000001','catalog-owner-a@example.test'),
('ac600000-0000-4000-8000-000000000002','catalog-owner-b@example.test'),
('ac600000-0000-4000-8000-000000000003','catalog-admin-a@example.test');
insert into public.businesses(id,name,slug) values
('bc600000-0000-4000-8000-000000000001','Catalog A','catalog-test-a'),
('bc600000-0000-4000-8000-000000000002','Catalog B','catalog-test-b');
insert into public.business_members(business_id,user_id,role) values
('bc600000-0000-4000-8000-000000000001','ac600000-0000-4000-8000-000000000001','owner'),
('bc600000-0000-4000-8000-000000000002','ac600000-0000-4000-8000-000000000002','owner'),
('bc600000-0000-4000-8000-000000000001','ac600000-0000-4000-8000-000000000003','admin');
update public.business_modules set enabled=true where module='management'
and business_id in ('bc600000-0000-4000-8000-000000000001','bc600000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ac600000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into catalog_results select lives_ok($$insert into public.product_categories(id,business_id,name) values
('cc600000-0000-4000-8000-000000000001','bc600000-0000-4000-8000-000000000001',' Bebidas ')$$,'owner with management creates category');
insert into catalog_results select is((select name from public.product_categories where id='cc600000-0000-4000-8000-000000000001'),'Bebidas','category normalized');
insert into catalog_results select throws_ok($$insert into public.product_categories(business_id,name) values('bc600000-0000-4000-8000-000000000001','bebidas')$$,'23505',null,'category unique case-insensitive');
insert into catalog_results select lives_ok($$insert into public.products(id,business_id,category_id,name,sku,barcode,cost_price,sale_price,minimum_stock) values
('dc600000-0000-4000-8000-000000000001','bc600000-0000-4000-8000-000000000001','cc600000-0000-4000-8000-000000000001',' Gatorade 500ml ',' gat-500 ','00789000',4.50,8.00,10.125)$$,'creates product with decimal reference cost and minimum');
insert into catalog_results select results_eq($$select name,sku,barcode,cost_price,sale_price,minimum_stock from public.products where id='dc600000-0000-4000-8000-000000000001'$$,
$$values ('Gatorade 500ml'::text,'GAT-500'::text,'00789000'::text,4.50::numeric,8.00::numeric,10.125::numeric)$$,'normalization preserves barcode zeroes and exact decimals');
insert into catalog_results select throws_ok($$insert into public.products(business_id,name,sku) values('bc600000-0000-4000-8000-000000000001','Other','gat-500')$$,'23505',null,'SKU unique case-insensitive');
insert into catalog_results select throws_ok($$insert into public.products(business_id,name,barcode) values('bc600000-0000-4000-8000-000000000001','Other','00789000')$$,'23505',null,'barcode unique');
insert into catalog_results select throws_ok($$insert into public.products(business_id,name,cost_price) values('bc600000-0000-4000-8000-000000000001','Negative',-1)$$,'23514',null,'negative cost rejected');
insert into catalog_results select throws_ok($$insert into public.products(business_id,name,sale_price) values('bc600000-0000-4000-8000-000000000001','Negative',-1)$$,'23514',null,'negative sale rejected');
insert into catalog_results select throws_ok($$insert into public.products(business_id,name,minimum_stock) values('bc600000-0000-4000-8000-000000000001','Negative',-1)$$,'23514',null,'negative minimum rejected');
insert into catalog_results select throws_ok($$insert into public.products(business_id,name,unit) values('bc600000-0000-4000-8000-000000000001','Unit','BAD')$$,'23514',null,'invalid unit rejected');
insert into catalog_results select throws_ok($$insert into public.products(business_id,name,sale_price) values('bc600000-0000-4000-8000-000000000001','NaN','NaN')$$,'23514',null,'NaN rejected');
insert into catalog_results select throws_ok($$insert into public.products(business_id,name) values('bc600000-0000-4000-8000-000000000002','Spoof')$$,'42501',null,'cross-tenant creation denied');

select set_config('request.jwt.claims','{"sub":"ac600000-0000-4000-8000-000000000002","role":"authenticated"}',true);
insert into catalog_results select lives_ok($$insert into public.product_categories(id,business_id,name) values
('cc600000-0000-4000-8000-000000000002','bc600000-0000-4000-8000-000000000002','Bebidas')$$,'same category in another tenant permitted');
insert into catalog_results select lives_ok($$insert into public.products(id,business_id,name,sku,barcode) values
('dc600000-0000-4000-8000-000000000002','bc600000-0000-4000-8000-000000000002','Tenant B','GAT-500','00789000')$$,'same SKU and barcode in another tenant permitted');

select set_config('request.jwt.claims','{"sub":"ac600000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into catalog_results select is((select count(*) from public.products),1::bigint,'tenant A cannot read B products');
insert into catalog_results select is((select count(*) from public.product_categories),1::bigint,'tenant A cannot read B categories');
insert into catalog_results select results_eq($$with changed as (update public.products set name='Spoof' where id='dc600000-0000-4000-8000-000000000002' returning id) select count(*) from changed$$,array[0::bigint],'cross-tenant update affects no rows');
insert into catalog_results select throws_ok($$update public.products set category_id='cc600000-0000-4000-8000-000000000002' where id='dc600000-0000-4000-8000-000000000001'$$,'23514',null,'cross-tenant category rejected');
insert into catalog_results select throws_ok($$update public.products set business_id='bc600000-0000-4000-8000-000000000002' where id='dc600000-0000-4000-8000-000000000001'$$,'42501',null,'cannot move product to another tenant');
insert into catalog_results select lives_ok($$update public.products set active=false where id='dc600000-0000-4000-8000-000000000001'$$,'inactivation allowed');
insert into catalog_results select is((select active from public.products where id='dc600000-0000-4000-8000-000000000001'),false,'inactive product preserved');
insert into catalog_results select lives_ok($$update public.products set active=true,sale_price=9.90 where id='dc600000-0000-4000-8000-000000000001'$$,'reactivation and price edit allowed');
insert into catalog_results select lives_ok($$update public.product_categories set active=false,name='Bebidas frias' where id='cc600000-0000-4000-8000-000000000001'$$,'category rename and inactivation allowed');
insert into catalog_results select lives_ok($$update public.products set name='Gatorade editado' where id='dc600000-0000-4000-8000-000000000001'$$,'existing inactive-category assignment remains editable');
insert into catalog_results select throws_ok($$insert into public.products(business_id,category_id,name) values('bc600000-0000-4000-8000-000000000001','cc600000-0000-4000-8000-000000000001','New')$$,'23514',null,'new product cannot use inactive category');
insert into catalog_results select lives_ok($$update public.product_categories set active=true where id='cc600000-0000-4000-8000-000000000001'$$,'category reactivation allowed');
insert into catalog_results select throws_ok($$delete from public.products where id='dc600000-0000-4000-8000-000000000001'$$,'42501',null,'physical deletion not granted');
select set_config('request.jwt.claims','{"sub":"ac600000-0000-4000-8000-000000000003","role":"authenticated"}',true);
insert into catalog_results select lives_ok($$update public.products set name='Admin edited' where id='dc600000-0000-4000-8000-000000000001'$$,'member admin can edit with management');
reset role;
update public.business_modules set enabled=false where business_id='bc600000-0000-4000-8000-000000000001' and module='management';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ac600000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into catalog_results select is((select count(*) from public.products),0::bigint,'disabled management hides products even via direct API');
insert into catalog_results select is((select count(*) from public.product_categories),0::bigint,'disabled management hides categories');
insert into catalog_results select throws_ok($$insert into public.products(business_id,name) values('bc600000-0000-4000-8000-000000000001','Disabled')$$,'42501',null,'disabled management blocks direct write');
insert into catalog_results select results_eq($$with changed as (update public.products set name='Disabled' where id='dc600000-0000-4000-8000-000000000001' returning id) select count(*) from changed$$,array[0::bigint],'disabled management blocks updates');
insert into catalog_results select ok(not private.can_manage_business_module('bc600000-0000-4000-8000-000000000002','management'),'helper cannot authorize foreign tenant');
insert into catalog_results select ok(private.can_manage_business_module('bc600000-0000-4000-8000-000000000001','scheduling'),'scheduling remains enabled independently');
reset role;
set local role anon;
insert into catalog_results select throws_ok($$select * from public.products$$,'42501',null,'anon cannot read products');
insert into catalog_results select throws_ok($$select * from public.product_categories$$,'42501',null,'anon cannot read categories');
insert into catalog_results select throws_ok($$insert into public.products(business_id,name) values('bc600000-0000-4000-8000-000000000001','Anon')$$,'42501',null,'anon cannot write');
reset role;
insert into catalog_results select ok(exists(select 1 from pg_constraint where conname='products_category_tenant_fk' and contype='f' and cardinality(conkey)=2),'composite FK enforces category tenant independently');
insert into catalog_results select ok(not has_table_privilege('service_role','public.products','SELECT,INSERT,UPDATE,DELETE'),'no extra service-role surface');
insert into catalog_results select * from finish();
select result from catalog_results;
rollback;
