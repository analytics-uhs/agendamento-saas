begin;
create extension if not exists pgtap with schema extensions;
create temp table fiscal_test_results(result text);
grant select,insert on fiscal_test_results to authenticated,anon;
insert into fiscal_test_results select no_plan();
insert into auth.users(id,email) values
 ('ae650000-0000-4000-8000-000000000001','fiscal-owner@example.test'),
 ('ae650000-0000-4000-8000-000000000002','fiscal-outsider@example.test');
insert into public.businesses(id,name,slug) values
 ('be650000-0000-4000-8000-000000000001','Fiscal A','fiscal-a-test'),
 ('be650000-0000-4000-8000-000000000002','Fiscal B','fiscal-b-test');
insert into public.business_members(business_id,user_id,role,created_at) values
 ('be650000-0000-4000-8000-000000000001','ae650000-0000-4000-8000-000000000001','owner','2020-01-01'),
 ('be650000-0000-4000-8000-000000000002','ae650000-0000-4000-8000-000000000001','admin','2021-01-01'),
 ('be650000-0000-4000-8000-000000000001','ae650000-0000-4000-8000-000000000002','admin','2022-01-01');
update public.business_modules set enabled=true where module='management' and business_id in ('be650000-0000-4000-8000-000000000001','be650000-0000-4000-8000-000000000002');
insert into public.products(id,business_id,name,sale_price) values
 ('de650000-0000-4000-8000-000000000001','be650000-0000-4000-8000-000000000002','Produto original',100),
 ('de650000-0000-4000-8000-000000000002','be650000-0000-4000-8000-000000000002','Segundo produto',200),
 ('de650000-0000-4000-8000-000000000003','be650000-0000-4000-8000-000000000001','Outro tenant',300);
insert into public.sales(id,business_id,customer_name,payment_method) values
 ('ce650000-0000-4000-8000-000000000001','be650000-0000-4000-8000-000000000002','Venda B','pix'),
 ('ce650000-0000-4000-8000-000000000002','be650000-0000-4000-8000-000000000002','Rascunho','pix'),
 ('ce650000-0000-4000-8000-000000000003','be650000-0000-4000-8000-000000000002','Vazia','pix'),
 ('ce650000-0000-4000-8000-000000000004','be650000-0000-4000-8000-000000000002','Total inconsistente','pix');
insert into public.sale_items(id,business_id,sale_id,product_id,quantity,unit_price) values
 ('ee650000-0000-4000-8000-000000000001','be650000-0000-4000-8000-000000000002','ce650000-0000-4000-8000-000000000001','de650000-0000-4000-8000-000000000001',1.125,10),
 ('ee650000-0000-4000-8000-000000000002','be650000-0000-4000-8000-000000000002','ce650000-0000-4000-8000-000000000001','de650000-0000-4000-8000-000000000002',2,4.50),
 ('ee650000-0000-4000-8000-000000000003','be650000-0000-4000-8000-000000000002','ce650000-0000-4000-8000-000000000004','de650000-0000-4000-8000-000000000001',1,10);
-- Synthetic invalid commercial states exercise validation; transaction always rolls back.
update public.sales set status='completed',completed_at=now(),total_amount=99 where id in ('ce650000-0000-4000-8000-000000000003','ce650000-0000-4000-8000-000000000004');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ae650000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into fiscal_test_results select lives_ok($$select public.complete_admin_sale('ce650000-0000-4000-8000-000000000001')$$,'sale completes with fiscal disabled');
insert into fiscal_test_results select throws_ok($$select public.prepare_admin_fiscal_document('be650000-0000-4000-8000-000000000002','ce650000-0000-4000-8000-000000000001')$$,'42501','fiscal_unauthorized','fiscal=false blocks preparation');
reset role;
insert into fiscal_test_results select is((select count(*) from public.fiscal_documents where business_id='be650000-0000-4000-8000-000000000002'),0::bigint,'sale does not auto create fiscal');
update public.business_modules set enabled=true where module='fiscal' and business_id in ('be650000-0000-4000-8000-000000000001','be650000-0000-4000-8000-000000000002');
-- Fiscal is its own module, not an alias of management.
update public.business_modules set enabled=false where module='management' and business_id='be650000-0000-4000-8000-000000000002';
set local role authenticated;
insert into fiscal_test_results select throws_ok($$select public.prepare_admin_fiscal_document('be650000-0000-4000-8000-000000000001','ce650000-0000-4000-8000-000000000001')$$,'42501','fiscal_sale_unavailable','explicit tenant A cannot prepare sale B');
insert into fiscal_test_results select throws_ok($$select public.prepare_admin_fiscal_document('be650000-0000-4000-8000-000000000002','ce650000-0000-4000-8000-000000000002')$$,'23514','fiscal_sale_not_completed','draft sale rejected');
insert into fiscal_test_results select throws_ok($$select public.prepare_admin_fiscal_document('be650000-0000-4000-8000-000000000002','ce650000-0000-4000-8000-000000000003')$$,'23514','fiscal_sale_empty','empty sale rejected');
insert into fiscal_test_results select throws_ok($$select public.prepare_admin_fiscal_document('be650000-0000-4000-8000-000000000002','ce650000-0000-4000-8000-000000000004')$$,'23514','fiscal_total_mismatch','inconsistent sale total rejected');
-- Force an item failure after header insertion to prove atomic rollback.
reset role;
create function pg_temp.reject_fiscal_item() returns trigger language plpgsql as $$begin raise exception 'test_item_failure';end;$$;
create trigger test_item_failure before insert on public.fiscal_document_items for each row execute function pg_temp.reject_fiscal_item();
set local role authenticated;
insert into fiscal_test_results select throws_ok($$select public.prepare_admin_fiscal_document('be650000-0000-4000-8000-000000000002','ce650000-0000-4000-8000-000000000001')$$,'P0001','test_item_failure','item failure rolls back preparation');
insert into fiscal_test_results select is((select count(*) from public.fiscal_documents),0::bigint,'failed preparation leaves no header');
reset role;
drop trigger test_item_failure on public.fiscal_document_items;
set local role authenticated;
insert into fiscal_test_results select lives_ok($$select public.prepare_admin_fiscal_document('be650000-0000-4000-8000-000000000002','ce650000-0000-4000-8000-000000000001')$$,'current B works despite first membership A and management=false');
insert into fiscal_test_results select is((select count(*) from public.fiscal_documents),1::bigint,'one document');
insert into fiscal_test_results select is((select status||':'||document_type from public.fiscal_documents),'draft:nfce','local draft NFC-e only');
insert into fiscal_test_results select ok((select prepared_at is not null from public.fiscal_documents),'prepared timestamp');
insert into fiscal_test_results select ok((select coalesce(provider,provider_document_id,access_key,document_number,series,protocol,xml_url,pdf_url,error_code,error_message) is null and coalesce(submitted_at,authorized_at,rejected_at,cancelled_at) is null from public.fiscal_documents),'provider and external response fields empty');
insert into fiscal_test_results select is((select count(*) from public.fiscal_document_items),2::bigint,'snapshot all sale items');
insert into fiscal_test_results select is((select quantity from public.fiscal_document_items where product_id='de650000-0000-4000-8000-000000000001'),1.125::numeric,'fractional quantity exact');
insert into fiscal_test_results select is((select unit_price from public.fiscal_document_items where product_id='de650000-0000-4000-8000-000000000001'),10::numeric,'historical sale price not catalog price');
insert into fiscal_test_results select is((select total_amount from public.fiscal_document_items where product_id='de650000-0000-4000-8000-000000000001'),11.25::numeric,'item total correct');
insert into fiscal_test_results select is((select total_amount from public.fiscal_documents),20.25::numeric,'document matches commercial total');
insert into fiscal_test_results select is((public.prepare_admin_fiscal_document('be650000-0000-4000-8000-000000000002','ce650000-0000-4000-8000-000000000001')).id,(select id from public.fiscal_documents),'second call returns existing document');
insert into fiscal_test_results select is((select count(*) from public.fiscal_document_items),2::bigint,'second preparation does not duplicate snapshot');
reset role;
update public.products set name='Nome alterado',sale_price=999 where id='de650000-0000-4000-8000-000000000001';
insert into fiscal_test_results select is((select description from public.fiscal_document_items where sale_item_id='ee650000-0000-4000-8000-000000000001'),'Produto original','description immutable after catalog edit');
insert into fiscal_test_results select is((select unit_price from public.fiscal_document_items where sale_item_id='ee650000-0000-4000-8000-000000000001'),10::numeric,'catalog repricing leaves snapshot unchanged');
insert into fiscal_test_results select throws_ok($$update public.fiscal_document_items set quantity=3 where business_id='be650000-0000-4000-8000-000000000002'$$,'55000','fiscal_read_only','snapshot update blocked even for privileged writer');
insert into fiscal_test_results select throws_ok($$delete from public.fiscal_documents where business_id='be650000-0000-4000-8000-000000000002'$$,'55000','fiscal_read_only','header delete blocked');
insert into fiscal_test_results select throws_ok($$insert into public.fiscal_document_items(business_id,fiscal_document_id,sale_item_id,product_id,description,quantity,unit_price,total_amount) select business_id,id,'ee650000-0000-4000-8000-000000000003','de650000-0000-4000-8000-000000000001','Nome alterado',1,10,10 from public.fiscal_documents where sale_id='ce650000-0000-4000-8000-000000000001'$$,'23514','fiscal_item_invalid','same tenant item from another sale rejected');
insert into fiscal_test_results select throws_ok($$insert into public.fiscal_document_items(business_id,fiscal_document_id,sale_item_id,product_id,description,quantity,unit_price,total_amount) select business_id,id,'ee650000-0000-4000-8000-000000000001','de650000-0000-4000-8000-000000000003','Outro tenant',1.125,10,11.25 from public.fiscal_documents where sale_id='ce650000-0000-4000-8000-000000000001'$$,'23514','fiscal_item_invalid','cross tenant product rejected');
insert into fiscal_test_results select is((select status from public.sales where id='ce650000-0000-4000-8000-000000000001'),'completed','sale status unchanged');
insert into fiscal_test_results select is((select count(*) from public.stock_movements where business_id='be650000-0000-4000-8000-000000000002'),2::bigint,'no new stock movement from fiscal');
insert into fiscal_test_results select is((select count(*) from public.financial_entries where business_id='be650000-0000-4000-8000-000000000002'),1::bigint,'no new financial entry from fiscal');
insert into fiscal_test_results select ok(exists(select 1 from pg_constraint where conrelid='public.fiscal_documents'::regclass and contype='u' and pg_get_constraintdef(oid)='UNIQUE (business_id, sale_id, document_type)'),'database duplicate barrier');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ae650000-0000-4000-8000-000000000002","role":"authenticated"}',true);
insert into fiscal_test_results select throws_ok($$select public.prepare_admin_fiscal_document('be650000-0000-4000-8000-000000000002','ce650000-0000-4000-8000-000000000001')$$,'42501','fiscal_unauthorized','unauthorized user rejected');
insert into fiscal_test_results select is((select count(*) from public.fiscal_documents),0::bigint,'other tenant cannot read header');
insert into fiscal_test_results select is((select count(*) from public.fiscal_document_items),0::bigint,'other tenant cannot read snapshot');
reset role;
update public.business_modules set enabled=false where module='fiscal' and business_id='be650000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ae650000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into fiscal_test_results select is((select count(*) from public.fiscal_documents),0::bigint,'disabled module hides document');
insert into fiscal_test_results select is((select count(*) from public.fiscal_document_items),0::bigint,'disabled module hides items');
reset role;
insert into fiscal_test_results select ok(not has_table_privilege('anon','public.fiscal_documents','SELECT,INSERT,UPDATE,DELETE') and not has_table_privilege('anon','public.fiscal_document_items','SELECT,INSERT,UPDATE,DELETE'),'anon no table access');
insert into fiscal_test_results select ok(not has_table_privilege('authenticated','public.fiscal_documents','INSERT,UPDATE,DELETE') and not has_table_privilege('authenticated','public.fiscal_document_items','INSERT,UPDATE,DELETE'),'clients cannot mutate directly');
insert into fiscal_test_results select ok(not has_function_privilege('anon','public.prepare_admin_fiscal_document(uuid,uuid)','EXECUTE'),'anon cannot prepare');
insert into fiscal_test_results select * from finish();
select result from fiscal_test_results;
rollback;
