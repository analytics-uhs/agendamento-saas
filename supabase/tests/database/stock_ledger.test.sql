begin;
create extension if not exists pgtap with schema extensions;
create temp table stock_results(result text); grant select,insert on stock_results to authenticated,anon;
insert into stock_results select no_plan();
insert into auth.users(id,email) values
('ae610000-0000-4000-8000-000000000001','stock-a@example.test'),
('ae610000-0000-4000-8000-000000000002','stock-b@example.test'),
('ae610000-0000-4000-8000-000000000003','stock-outsider@example.test');
insert into public.businesses(id,name,slug) values
('be610000-0000-4000-8000-000000000001','Stock A','stock-test-a'),
('be610000-0000-4000-8000-000000000002','Stock B','stock-test-b');
insert into public.business_members(business_id,user_id,role) values
('be610000-0000-4000-8000-000000000001','ae610000-0000-4000-8000-000000000001','owner'),
('be610000-0000-4000-8000-000000000002','ae610000-0000-4000-8000-000000000002','owner');
update public.business_modules set enabled=true where module='management' and business_id in ('be610000-0000-4000-8000-000000000001','be610000-0000-4000-8000-000000000002');
insert into public.products(id,business_id,name,unit,minimum_stock,active) values
('de610000-0000-4000-8000-000000000001','be610000-0000-4000-8000-000000000001','Gelo','KG',3,true),
('de610000-0000-4000-8000-000000000002','be610000-0000-4000-8000-000000000001','Inativo','UN',0,false),
('de610000-0000-4000-8000-000000000003','be610000-0000-4000-8000-000000000002','Outro tenant','UN',0,true);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ae610000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into stock_results select lives_ok($$select public.create_admin_stock_movement('de610000-0000-4000-8000-000000000001','manual_in',10,4.50,null,null)$$,'manual input accepted');
insert into stock_results select is((select quantity_delta from public.stock_movements where product_id='de610000-0000-4000-8000-000000000001' order by created_at desc limit 1),10::numeric,'input delta positive');
insert into stock_results select lives_ok($$select public.create_admin_stock_movement('de610000-0000-4000-8000-000000000001','manual_out',3,null,null,null)$$,'manual output accepted');
insert into stock_results select is((select quantity_delta from public.stock_movements where product_id='de610000-0000-4000-8000-000000000001' and movement_type='manual_out' order by created_at desc limit 1),(-3)::numeric,'output delta negative');
insert into stock_results select lives_ok($$select public.create_admin_stock_movement('de610000-0000-4000-8000-000000000001','adjustment_in',2,null,'Contagem',null)$$,'positive adjustment accepted');
insert into stock_results select lives_ok($$select public.create_admin_stock_movement('de610000-0000-4000-8000-000000000001','adjustment_out',1,null,'Contagem',null)$$,'negative adjustment accepted');
insert into stock_results select lives_ok($$select public.create_admin_stock_movement('de610000-0000-4000-8000-000000000001','loss',1,null,'Quebra',null)$$,'loss accepted');
insert into stock_results select throws_ok($$select public.create_admin_stock_movement('de610000-0000-4000-8000-000000000001','manual_in',0,null,null,null)$$,'22023','stock_quantity_invalid','zero rejected');
insert into stock_results select throws_ok($$select public.create_admin_stock_movement('de610000-0000-4000-8000-000000000001','manual_in',1,-1,null,null)$$,'22023','stock_unit_cost_invalid','negative cost rejected');
insert into stock_results select throws_ok($$select public.create_admin_stock_movement('de610000-0000-4000-8000-000000000001','bad',1,null,null,null)$$,'22023','stock_movement_type_invalid','invalid type rejected');
insert into stock_results select throws_ok($$select public.create_admin_stock_movement('de610000-0000-4000-8000-000000000001','loss',1,null,null,null)$$,'22023','stock_reason_required','loss reason required');
insert into stock_results select throws_ok($$select public.create_admin_stock_movement('de610000-0000-4000-8000-000000000003','manual_in',1,null,null,null)$$,'42501','stock_product_unavailable','cross tenant product rejected');
insert into stock_results select is((select count(*) from public.stock_movements where business_id='be610000-0000-4000-8000-000000000002'),0::bigint,'tenant A cannot read B ledger');
insert into stock_results select throws_ok($$insert into public.stock_movements(business_id,product_id,movement_type,quantity_delta) values('be610000-0000-4000-8000-000000000001','de610000-0000-4000-8000-000000000001','manual_in',1)$$,'42501',null,'direct insert blocked');
insert into stock_results select throws_ok($$update public.stock_movements set reason='edit'$$,'42501',null,'update blocked');
insert into stock_results select throws_ok($$delete from public.stock_movements$$,'42501',null,'delete blocked');
insert into stock_results select is((select quantity from public.product_stock_balances where product_id='de610000-0000-4000-8000-000000000001'),7::numeric,'balance is signed sum');
insert into stock_results select is((select quantity::text||':'||stock_status from public.product_stock_balances where product_id='de610000-0000-4000-8000-000000000002'),'0.000:normal','product without movements has zero normal balance');
insert into stock_results select lives_ok($$select public.create_admin_stock_movement('de610000-0000-4000-8000-000000000002','adjustment_in',2,null,'Correção',null)$$,'inactive product accepts correction');
insert into stock_results select lives_ok($$select public.create_admin_stock_movement('de610000-0000-4000-8000-000000000001','manual_out',20,null,null,null)$$,'negative stock allowed');
insert into stock_results select is((select quantity::text||':'||stock_status from public.product_stock_balances where product_id='de610000-0000-4000-8000-000000000001'),'-13.000:negative','negative balance classified');
insert into stock_results select lives_ok($$select public.reverse_admin_stock_movement((select id from public.stock_movements where product_id='de610000-0000-4000-8000-000000000001' and movement_type='manual_out' and quantity_delta=-20),null)$$,'reversal accepted');
insert into stock_results select is((select quantity_delta from public.stock_movements where movement_type='reversal'),20::numeric,'reversal delta exactly inverse');
insert into stock_results select ok((select reversal_of_id is not null from public.stock_movements where movement_type='reversal'),'reversal links original');
insert into stock_results select throws_ok($$select public.reverse_admin_stock_movement((select reversal_of_id from public.stock_movements where movement_type='reversal'),null)$$,'23505','stock_movement_already_reversed','double reversal rejected');
insert into stock_results select is((select count(*) from public.stock_movements where movement_type='reversal'),1::bigint,'single reversal persisted after duplicate attempt');
insert into stock_results select throws_ok($$select public.reverse_admin_stock_movement((select id from public.stock_movements where movement_type='reversal'),null)$$,'23514','stock_reversal_not_reversible','reversal chain rejected');
reset role;
update public.business_modules set enabled=false where business_id='be610000-0000-4000-8000-000000000001' and module='management';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ae610000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into stock_results select is((select count(*) from public.product_stock_balances),0::bigint,'management false hides balances');
insert into stock_results select throws_ok($$select public.create_admin_stock_movement('de610000-0000-4000-8000-000000000001','manual_in',1,null,null,null)$$,'42501','stock_product_unavailable','management false blocks creation');
select set_config('request.jwt.claims','{"sub":"ae610000-0000-4000-8000-000000000003","role":"authenticated"}',true);
insert into stock_results select is((select count(*) from public.stock_movements),0::bigint,'non member reads no ledger');
reset role; set local role anon;
insert into stock_results select throws_ok($$select * from public.product_stock_balances$$,'42501',null,'anon cannot read balances');
insert into stock_results select throws_ok($$select public.create_admin_stock_movement('de610000-0000-4000-8000-000000000001','manual_in',1,null,null,null)$$,'42501',null,'anon cannot execute mutation');
reset role;
insert into stock_results select ok(not has_table_privilege('service_role','public.stock_movements','SELECT,INSERT,UPDATE,DELETE'),'service role receives no ledger grants');
insert into stock_results select ok(exists(select 1 from pg_indexes where indexname='stock_movements_single_reversal_idx'),'database enforces one reversal');
insert into stock_results select * from finish(); select result from stock_results; rollback;
