begin;
create extension if not exists pgtap with schema extensions;
create temp table copa_results(result text);
grant select,insert on copa_results to authenticated,anon;
insert into copa_results select no_plan();
insert into auth.users(id,email) values
 ('ae690000-0000-4000-8000-000000000001','copa-owner@example.test'),
 ('ae690000-0000-4000-8000-000000000002','copa-admin@example.test');
insert into public.businesses(id,name,slug) values
 ('be690000-0000-4000-8000-000000000001','Copa A','test-copa-a'),
 ('be690000-0000-4000-8000-000000000002','Copa B','test-copa-b');
insert into public.business_members(business_id,user_id,role) values
 ('be690000-0000-4000-8000-000000000001','ae690000-0000-4000-8000-000000000001','owner'),
 ('be690000-0000-4000-8000-000000000001','ae690000-0000-4000-8000-000000000002','admin');
update public.business_modules set enabled=true where business_id='be690000-0000-4000-8000-000000000001' and module in ('management','fiscal');
insert into public.products(id,business_id,name,sale_price) values
 ('de690000-0000-4000-8000-000000000001','be690000-0000-4000-8000-000000000001','Água',5),
 ('de690000-0000-4000-8000-000000000002','be690000-0000-4000-8000-000000000001','Suco',7),
 ('de690000-0000-4000-8000-000000000003','be690000-0000-4000-8000-000000000002','Outro tenant',9);
insert into public.sales(id,business_id) values('ce690000-0000-4000-8000-000000000003','be690000-0000-4000-8000-000000000002');
insert into copa_results select is((select sale_type from public.sales where id='ce690000-0000-4000-8000-000000000003'),'quick','legacy/default sales are quick');
create function pg_temp.copa_item(q numeric,p uuid default 'de690000-0000-4000-8000-000000000001') returns integer language sql as $$
 select public.set_admin_copa_item('be690000-0000-4000-8000-000000000001','ce690000-0000-4000-8000-000000000001','tab',
 (select revision from public.sales where id='ce690000-0000-4000-8000-000000000001'),p,q);
$$;
create function pg_temp.copa_close() returns uuid language sql as $$
 select public.complete_admin_copa_sale('be690000-0000-4000-8000-000000000001','ce690000-0000-4000-8000-000000000001','tab',
 (select revision from public.sales where id='ce690000-0000-4000-8000-000000000001'),'pix');
$$;
grant execute on function pg_temp.copa_item(numeric,uuid),pg_temp.copa_close() to authenticated;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ae690000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into copa_results select throws_ok($$select public.open_admin_copa_sale('be690000-0000-4000-8000-000000000001','ce690000-0000-4000-8000-000000000001','tab',' ')$$,'22023','copa_invalid','tab requires identification');
insert into copa_results select lives_ok($$select public.open_admin_copa_sale('be690000-0000-4000-8000-000000000001','ce690000-0000-4000-8000-000000000001','tab',' João ')$$,'owner opens tab');
insert into copa_results select lives_ok($$select public.open_admin_copa_sale('be690000-0000-4000-8000-000000000001','ce690000-0000-4000-8000-000000000001','tab','João')$$,'open request idempotent');
insert into copa_results select is((select count(*) from public.sales),1::bigint,'no duplicate opening');
insert into copa_results select is((select tab_name from public.sales),'João','identification separate from customer');
insert into copa_results select is((select customer_name from public.sales),null::text,'no fake customer');
insert into copa_results select lives_ok($$select pg_temp.copa_item(1)$$,'add product');
insert into copa_results select lives_ok($$select pg_temp.copa_item(3)$$,'increment product');
insert into copa_results select is((select quantity from public.sale_items),3::numeric,'quantity persisted');
insert into copa_results select is((select total_amount from public.sales),15::numeric,'total recalculated');
insert into copa_results select throws_ok($$select public.set_admin_copa_item('be690000-0000-4000-8000-000000000001','ce690000-0000-4000-8000-000000000001','tab',0,'de690000-0000-4000-8000-000000000001',9)$$,'40001','copa_stale','second screen stale update rejected');
insert into copa_results select throws_ok($$select pg_temp.copa_item(1.5)$$,'22023','copa_integer_quantity_required','decimal rejected');
insert into copa_results select throws_ok($$select pg_temp.copa_item(-1)$$,'22023','copa_integer_quantity_required','negative rejected');
insert into copa_results select throws_ok($$select pg_temp.copa_item(1,'de690000-0000-4000-8000-000000000003')$$,'42501','copa_product_unavailable','cross tenant product rejected');
insert into copa_results select throws_ok($$select public.set_admin_copa_item('be690000-0000-4000-8000-000000000001','ce690000-0000-4000-8000-000000000003','quick',0,'de690000-0000-4000-8000-000000000001',1)$$,'42501','copa_unavailable','cross tenant sale rejected');
insert into copa_results select is((select count(*) from public.stock_movements),0::bigint,'open tab does not reduce/reserve stock');
insert into copa_results select is((select count(*) from public.financial_entries),0::bigint,'open tab creates no financial entry');
insert into copa_results select is((select count(*) from public.fiscal_documents),0::bigint,'open tab creates no fiscal document');
insert into copa_results select throws_ok($$select public.save_admin_sale_draft('ce690000-0000-4000-8000-000000000001','wrong','pix','[{"product_id":"de690000-0000-4000-8000-000000000001","quantity":1,"unit_price":1}]')$$,'42501','copa_use_guarded_operation','legacy bulk editor cannot overwrite tab');
reset role;
update public.products set sale_price=99 where id='de690000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ae690000-0000-4000-8000-000000000002","role":"authenticated"}',true);
insert into copa_results select lives_ok($$select pg_temp.copa_item(2)$$,'admin decreases quantity');
insert into copa_results select is((select unit_price from public.sale_items),5::numeric,'original snapshot price retained');
insert into copa_results select lives_ok($$select pg_temp.copa_item(1,'de690000-0000-4000-8000-000000000002')$$,'second item');
insert into copa_results select lives_ok($$select pg_temp.copa_item(0,'de690000-0000-4000-8000-000000000002')$$,'zero removes line');
insert into copa_results select is((select count(*) from public.sale_items),1::bigint,'item removed');
reset role;
update public.business_modules set enabled=false where business_id='be690000-0000-4000-8000-000000000001' and module='management';
set local role authenticated;
insert into copa_results select throws_ok($$select pg_temp.copa_item(3)$$,'42501','copa_unauthorized','disabled management blocks operation');
insert into copa_results select is((select count(*) from public.sales),0::bigint,'disabled management blocks read');
reset role;
insert into copa_results select is((select count(*) from public.sales where id='ce690000-0000-4000-8000-000000000001'),1::bigint,'disabled module did not delete tab');
update public.business_modules set enabled=true where business_id='be690000-0000-4000-8000-000000000001' and module='management';
set local role authenticated;
insert into copa_results select is((select total_amount from public.sales),10::numeric,'reopened draft retains quantities and total');
insert into copa_results select lives_ok($$select pg_temp.copa_close()$$,'tab closes through existing engine');
insert into copa_results select is((select status from public.sales),'completed','sale completed');
insert into copa_results select is((select payment_method from public.sales),'pix','payment persisted');
insert into copa_results select is((select quantity_delta from public.stock_movements),(-2)::numeric,'single negative stock movement');
insert into copa_results select is((select amount from public.financial_entries),10::numeric,'single financial income');
insert into copa_results select throws_ok($$select pg_temp.copa_close()$$,'55000','sale_already_completed','double close rejected');
insert into copa_results select is((select count(*) from public.stock_movements),1::bigint,'no duplicate stock');
insert into copa_results select is((select count(*) from public.financial_entries),1::bigint,'no duplicate income');
insert into copa_results select throws_ok($$select pg_temp.copa_item(9)$$,'42501','copa_unavailable','completed not editable');
insert into copa_results select lives_ok($$select public.prepare_admin_fiscal_document('be690000-0000-4000-8000-000000000001','ce690000-0000-4000-8000-000000000001')$$,'completed tab remains fiscal compatible, no Focus');
insert into copa_results select lives_ok($$select public.open_admin_copa_sale('be690000-0000-4000-8000-000000000001','ce690000-0000-4000-8000-000000000002','quick',null)$$,'quick requires no identification');
select public.set_admin_copa_item('be690000-0000-4000-8000-000000000001','ce690000-0000-4000-8000-000000000002','quick',0,'de690000-0000-4000-8000-000000000002',1);
insert into copa_results select lives_ok($$select public.complete_admin_copa_sale('be690000-0000-4000-8000-000000000001','ce690000-0000-4000-8000-000000000002','quick',1,'cash')$$,'quick uses same completion engine');
insert into copa_results select is((select count(*) from public.financial_entries),2::bigint,'quick also creates exactly one income');
reset role;
set local role anon;
insert into copa_results select throws_ok($$select public.open_admin_copa_sale('be690000-0000-4000-8000-000000000001','ce690000-0000-4000-8000-000000000004','tab','anon')$$,'42501',null,'anon denied');
reset role;
insert into copa_results select * from finish();
select result from copa_results;
rollback;
