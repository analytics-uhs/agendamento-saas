begin;
create extension if not exists pgtap with schema extensions;
create temp table financial_test_results(result text);
grant select,insert on financial_test_results to authenticated,anon;
insert into financial_test_results select no_plan();
insert into auth.users(id,email) values ('ae641000-0000-4000-8000-000000000001','finance-multi@example.test');
insert into public.businesses(id,name,slug) values
 ('be641000-0000-4000-8000-000000000001','Empresa A','finance-multi-a-test'),
 ('be641000-0000-4000-8000-000000000002','Empresa B','finance-multi-b-test'),
 ('be641000-0000-4000-8000-000000000003','Unauthorized','finance-multi-c-test');
insert into public.business_members(business_id,user_id,role,created_at) values
 ('be641000-0000-4000-8000-000000000001','ae641000-0000-4000-8000-000000000001','owner','2020-01-01'),
 ('be641000-0000-4000-8000-000000000002','ae641000-0000-4000-8000-000000000001','admin','2021-01-01');
update public.business_modules set enabled=true where module='management' and business_id in ('be641000-0000-4000-8000-000000000001','be641000-0000-4000-8000-000000000002','be641000-0000-4000-8000-000000000003');
-- A contains a sentinel that must neither contribute to B's summary nor change.
insert into public.financial_entries(business_id,entry_type,amount,entry_date,source_type,status)
 values ('be641000-0000-4000-8000-000000000001','income',999,'2030-01-01','manual','paid');
insert into public.reservations(id,business_id,customer_name,customer_whatsapp,source)
 values ('ce641000-0000-4000-8000-000000000001','be641000-0000-4000-8000-000000000002','B combined','11999999999','admin');
insert into public.appointments(id,business_id,customer_name,customer_whatsapp,appointment_date,start_time,end_time,duration_minutes,reservation_id) values
 ('ee641000-0000-4000-8000-000000000001','be641000-0000-4000-8000-000000000002','B legacy','11999999999','2030-01-01','10:00','11:00',60,null),
 ('ee641000-0000-4000-8000-000000000002','be641000-0000-4000-8000-000000000002','B combined','11999999999','2030-01-01','11:00','12:00',60,'ce641000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ae641000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into financial_test_results select is((select business_id from public.business_members where user_id=auth.uid() order by created_at limit 1),'be641000-0000-4000-8000-000000000001'::uuid,'A is the first membership, not current B');
insert into financial_test_results select is((public.create_admin_financial_entry('be641000-0000-4000-8000-000000000002','manual',null,'income',20,'B manual','pix','2030-01-01','paid')).business_id,'be641000-0000-4000-8000-000000000002'::uuid,'manual receipt returned belongs to B');
insert into financial_test_results select is(public.get_admin_financial_summary('be641000-0000-4000-8000-000000000002','2030-01-01')->>'income','20.00','B summary excludes A sentinel');
insert into financial_test_results select lives_ok($$select public.create_admin_financial_entry('be641000-0000-4000-8000-000000000002','appointment','ee641000-0000-4000-8000-000000000001','income',30,null,'cash','2030-01-01','paid')$$,'B legacy appointment payment succeeds');
insert into financial_test_results select lives_ok($$select public.create_admin_financial_entry('be641000-0000-4000-8000-000000000002','appointment','ee641000-0000-4000-8000-000000000002','income',40,null,'card','2030-01-01','paid')$$,'B combined appointment payment succeeds');
insert into financial_test_results select is((select source_id from public.financial_entries where business_id='be641000-0000-4000-8000-000000000002' and source_type='reservation'),'ce641000-0000-4000-8000-000000000001'::uuid,'B canonicalizes appointment to reservation');
insert into financial_test_results select throws_ok($$select public.create_admin_financial_entry('be641000-0000-4000-8000-000000000002','reservation','ce641000-0000-4000-8000-000000000001','income',40,null,null,'2030-01-01','paid')$$,'23505',null,'B reservation cannot duplicate canonical receipt');
insert into financial_test_results select throws_ok($$select public.create_admin_financial_entry('be641000-0000-4000-8000-000000000001','appointment','ee641000-0000-4000-8000-000000000001','income',30,null,null,'2030-01-01','paid')$$,'42501','financial_unauthorized','authorized A cannot reference B appointment');
insert into financial_test_results select is(public.get_admin_financial_summary('be641000-0000-4000-8000-000000000002','2030-01-01')->>'balance','90.00','B summary includes only B manual and payments');
insert into financial_test_results select is((select count(*) from public.financial_entries where business_id='be641000-0000-4000-8000-000000000001'),1::bigint,'no receipt inserted into A');
insert into financial_test_results select is((select amount from public.financial_entries where business_id='be641000-0000-4000-8000-000000000001'),999::numeric,'A sentinel unchanged');
insert into financial_test_results select is((select count(*) from public.appointments where business_id='be641000-0000-4000-8000-000000000002' and status='scheduled'),2::bigint,'B operational statuses unchanged');
insert into financial_test_results select throws_ok($$select public.create_admin_financial_entry('be641000-0000-4000-8000-000000000003','manual',null,'income',1,null,null,'2030-01-01','paid')$$,'42501','financial_unauthorized','unauthorized business mutation blocked');
insert into financial_test_results select throws_ok($$select public.get_admin_financial_summary('be641000-0000-4000-8000-000000000003','2030-01-01')$$,'42501','financial_unauthorized','unauthorized business summary blocked');
insert into financial_test_results select throws_ok($$select public.get_admin_financial_summary(null,'2030-01-01')$$,'42501','financial_unauthorized','null business cannot infer membership');
insert into financial_test_results select ok(not has_function_privilege('authenticated','public.create_admin_financial_entry(text,uuid,text,numeric,text,text,date,text)','EXECUTE'),'old mutation signature has no client access');
insert into financial_test_results select ok(not has_function_privilege('authenticated','public.get_admin_financial_summary(date)','EXECUTE'),'old summary signature has no client access');
insert into financial_test_results select ok(not has_function_privilege('anon','public.create_admin_financial_entry(uuid,text,uuid,text,numeric,text,text,date,text)','EXECUTE'),'anon cannot create');
insert into financial_test_results select ok(not has_function_privilege('anon','public.get_admin_financial_summary(uuid,date)','EXECUTE'),'anon cannot read summary');
reset role;
insert into financial_test_results select is((select count(*) from public.financial_entries where business_id='be641000-0000-4000-8000-000000000003'),0::bigint,'rejected mutation leaves no unauthorized data');
insert into financial_test_results select * from finish();
select result from financial_test_results;
rollback;
