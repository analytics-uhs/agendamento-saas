-- Require the current business explicitly; never infer it from membership order.
-- Retain obsolete signatures only as fail-closed stubs, without client grants.
create or replace function public.create_admin_financial_entry(
  p_source_type text, p_source_id uuid, p_entry_type text, p_amount numeric,
  p_description text, p_payment_method text, p_entry_date date, p_status text
) returns public.financial_entries
language plpgsql security definer set search_path='' as $$
begin raise exception 'financial_business_required' using errcode='22023'; end; $$;
revoke all on function public.create_admin_financial_entry(text,uuid,text,numeric,text,text,date,text) from public,anon,authenticated,service_role;

create or replace function public.get_admin_financial_summary(p_month date) returns jsonb
language plpgsql security definer set search_path='' as $$
begin raise exception 'financial_business_required' using errcode='22023'; end; $$;
revoke all on function public.get_admin_financial_summary(date) from public,anon,authenticated,service_role;

create function public.create_admin_financial_entry(
  p_business_id uuid, p_source_type text, p_source_id uuid, p_entry_type text, p_amount numeric,
  p_description text, p_payment_method text, p_entry_date date, p_status text
) returns public.financial_entries
language plpgsql security definer set search_path='' as $$
declare v_reservation uuid; v_type text:=p_source_type; v_id uuid:=p_source_id;
  v_result public.financial_entries;
begin
  if auth.uid() is null or p_business_id is null
    or not private.can_manage_business_module(p_business_id,'management') then
    raise exception 'financial_unauthorized' using errcode='42501';
  end if;
  if p_source_type='manual' then
    if p_source_id is not null then raise exception 'financial_invalid' using errcode='22023'; end if;
  elsif p_source_type='appointment' then
    select reservation_id into v_reservation from public.appointments
      where id=p_source_id and business_id=p_business_id for share;
    if not found then raise exception 'financial_unauthorized' using errcode='42501'; end if;
    if v_reservation is not null then v_type:='reservation'; v_id:=v_reservation; end if;
  elsif p_source_type='reservation' then
    perform 1 from public.reservations where id=p_source_id and business_id=p_business_id for share;
    if not found then raise exception 'financial_unauthorized' using errcode='42501'; end if;
  else raise exception 'financial_invalid' using errcode='22023';
  end if;
  if p_amount is null or p_amount<=0 or p_amount>999999999999.99 or p_amount<>round(p_amount,2)
    or p_entry_type is null or p_entry_type not in ('income','expense')
    or (v_type<>'manual' and p_entry_type<>'income')
    or p_status is null or p_status not in ('paid','pending') or p_entry_date is null then
    raise exception 'financial_invalid' using errcode='22023';
  end if;
  insert into public.financial_entries(business_id,entry_type,amount,description,payment_method,entry_date,source_type,source_id,status,created_by)
    values(p_business_id,p_entry_type,p_amount,nullif(btrim(p_description),''),nullif(btrim(p_payment_method),''),p_entry_date,v_type,v_id,p_status,auth.uid())
    returning * into v_result;
  return v_result;
end; $$;
revoke all on function public.create_admin_financial_entry(uuid,text,uuid,text,numeric,text,text,date,text) from public,anon,authenticated,service_role;
grant execute on function public.create_admin_financial_entry(uuid,text,uuid,text,numeric,text,text,date,text) to authenticated;

create function public.get_admin_financial_summary(p_business_id uuid, p_month date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_start date; v_income numeric; v_expense numeric;
begin
  if auth.uid() is null or p_business_id is null
    or not private.can_manage_business_module(p_business_id,'management') then
    raise exception 'financial_unauthorized' using errcode='42501'; end if;
  if p_month is null or not isfinite(p_month) then raise exception 'financial_invalid' using errcode='22023'; end if;
  v_start:=date_trunc('month',p_month)::date;
  select coalesce(sum(amount) filter(where entry_type='income'),0), coalesce(sum(amount) filter(where entry_type='expense'),0)
    into v_income,v_expense from public.financial_entries
    where business_id=p_business_id and status='paid' and entry_date>=v_start and entry_date<(v_start+interval '1 month');
  return jsonb_build_object('income',v_income::text,'expense',v_expense::text,'balance',(v_income-v_expense)::text);
end; $$;
revoke all on function public.get_admin_financial_summary(uuid,date) from public,anon,authenticated,service_role;
grant execute on function public.get_admin_financial_summary(uuid,date) to authenticated;
