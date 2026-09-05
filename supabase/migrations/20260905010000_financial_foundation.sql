-- Financial status is independent of operational booking status.
create table public.financial_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  entry_type text not null check (entry_type in ('income','expense')),
  amount numeric(14,2) not null check (amount > 0 and amount <= 999999999999.99),
  description text check (description is null or char_length(description) <= 500),
  payment_method text check (payment_method in ('pix','cash','card','other')),
  entry_date date not null default (now() at time zone 'America/Sao_Paulo')::date check (isfinite(entry_date)),
  source_type text not null check (source_type in ('manual','sale','appointment','reservation')),
  source_id uuid,
  status text not null check (status in ('paid','pending')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sale_id uuid generated always as (case when source_type='sale' then source_id end) stored,
  appointment_id uuid generated always as (case when source_type='appointment' then source_id end) stored,
  reservation_id uuid generated always as (case when source_type='reservation' then source_id end) stored,
  constraint financial_origin_shape check (
    (source_type='manual' and source_id is null) or
    (source_type<>'manual' and source_id is not null and entry_type='income')
  ),
  foreign key (sale_id,business_id) references public.sales(id,business_id),
  foreign key (appointment_id) references public.appointments(id),
  foreign key (reservation_id,business_id) references public.reservations(id,business_id)
);
create unique index financial_origin_unique on public.financial_entries(source_type,source_id) where source_id is not null;
create index financial_month_idx on public.financial_entries(business_id,entry_date desc,id);
alter table public.financial_entries enable row level security;
revoke all on public.financial_entries from public,anon,authenticated,service_role;
grant select on public.financial_entries to authenticated;
create policy financial_read on public.financial_entries for select to authenticated
using ((select private.can_manage_business_module(business_id,'management')));

create function private.validate_financial_entry() returns trigger
language plpgsql set search_path='' as $$
declare v_sale public.sales;
begin
  if tg_op <> 'INSERT' then raise exception 'financial_read_only' using errcode='55000'; end if;
  if new.source_type='sale' then
    select * into v_sale from public.sales where id=new.source_id and business_id=new.business_id;
    if not found or v_sale.status<>'completed' or new.status<>'paid'
      or new.amount<>v_sale.total_amount or new.payment_method is distinct from v_sale.payment_method then
      raise exception 'financial_sale_invalid' using errcode='23514';
    end if;
  elsif new.source_type='appointment' then
    if not exists (select 1 from public.appointments where id=new.source_id and business_id=new.business_id and reservation_id is null) then
      raise exception 'financial_appointment_invalid' using errcode='23514';
    end if;
  end if;
  return new;
end; $$;
create trigger financial_validate before insert or update or delete on public.financial_entries
for each row execute function private.validate_financial_entry();
revoke all on function private.validate_financial_entry() from public,anon,authenticated,service_role;

-- Mutation accepts no business_id. Agenda origin is canonicalized in the database.
create function public.create_admin_financial_entry(
  p_source_type text, p_source_id uuid, p_entry_type text, p_amount numeric,
  p_description text, p_payment_method text, p_entry_date date, p_status text
) returns public.financial_entries
language plpgsql security definer set search_path='' as $$
declare v_business uuid; v_reservation uuid; v_type text:=p_source_type; v_id uuid:=p_source_id;
  v_result public.financial_entries;
begin
  if auth.uid() is null then raise exception 'financial_unauthorized' using errcode='42501'; end if;
  select business_id into v_business from public.business_members
    where user_id=auth.uid() order by created_at limit 1;
  if v_business is null or not private.can_manage_business_module(v_business,'management') then
    raise exception 'financial_unauthorized' using errcode='42501';
  end if;
  if p_source_type='manual' then
    if p_source_id is not null then raise exception 'financial_invalid' using errcode='22023'; end if;
  elsif p_source_type='appointment' then
    select reservation_id into v_reservation from public.appointments
      where id=p_source_id and business_id=v_business for share;
    if not found then raise exception 'financial_unauthorized' using errcode='42501'; end if;
    if v_reservation is not null then v_type:='reservation'; v_id:=v_reservation; end if;
  elsif p_source_type='reservation' then
    perform 1 from public.reservations where id=p_source_id and business_id=v_business for share;
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
    values(v_business,p_entry_type,p_amount,nullif(btrim(p_description),''),nullif(btrim(p_payment_method),''),p_entry_date,v_type,v_id,p_status,auth.uid())
    returning * into v_result;
  return v_result;
end; $$;
revoke all on function public.create_admin_financial_entry(text,uuid,text,numeric,text,text,date,text) from public,anon,authenticated,service_role;
grant execute on function public.create_admin_financial_entry(text,uuid,text,numeric,text,text,date,text) to authenticated;

create function public.get_admin_financial_summary(p_month date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_business uuid; v_start date; v_income numeric; v_expense numeric;
begin
  select business_id into v_business from public.business_members where user_id=auth.uid() order by created_at limit 1;
  if v_business is null or not private.can_manage_business_module(v_business,'management') then
    raise exception 'financial_unauthorized' using errcode='42501'; end if;
  if p_month is null or not isfinite(p_month) then raise exception 'financial_invalid' using errcode='22023'; end if;
  v_start:=date_trunc('month',p_month)::date;
  select coalesce(sum(amount) filter(where entry_type='income'),0), coalesce(sum(amount) filter(where entry_type='expense'),0)
    into v_income,v_expense from public.financial_entries
    where business_id=v_business and status='paid' and entry_date>=v_start and entry_date<(v_start+interval '1 month');
  return jsonb_build_object('income',v_income::text,'expense',v_expense::text,'balance',(v_income-v_expense)::text);
end; $$;
revoke all on function public.get_admin_financial_summary(date) from public,anon,authenticated,service_role;
grant execute on function public.get_admin_financial_summary(date) to authenticated;

-- Replaces only completion; sales, ledger and financial receipt commit together.
create or replace function public.complete_admin_sale(p_sale_id uuid) returns public.sales
language plpgsql security definer set search_path='' as $$
declare v_sale public.sales; v_count integer; v_now timestamptz:=now(); v_total numeric(14,2);
begin
  if auth.uid() is null then raise exception 'sale_unauthorized' using errcode='42501'; end if;
  select * into v_sale from public.sales where id=p_sale_id for update;
  if not found or not private.can_manage_business_module(v_sale.business_id,'management') then
    raise exception 'sale_unavailable' using errcode='42501'; end if;
  if v_sale.status<>'draft' then raise exception 'sale_already_completed' using errcode='55000'; end if;
  if v_sale.payment_method is null then raise exception 'sale_payment_required' using errcode='23514'; end if;
  select count(*),sum(quantity*unit_price) into v_count,v_total from public.sale_items where sale_id=v_sale.id;
  if v_count<1 then raise exception 'sale_empty' using errcode='23514'; end if;
  if v_total<=0 then raise exception 'sale_positive_total_required' using errcode='23514'; end if;
  update public.sales set total_amount=v_total,status='completed',completed_at=v_now where id=v_sale.id returning * into v_sale;
  insert into public.stock_movements(business_id,product_id,movement_type,quantity_delta,unit_cost,reason,source_type,source_id,created_by,occurred_at)
    select business_id,product_id,'sale',-quantity,null,'Venda finalizada','sale',id,auth.uid(),v_now
    from public.sale_items where sale_id=v_sale.id;
  insert into public.financial_entries(business_id,entry_type,amount,description,payment_method,entry_date,source_type,source_id,status,created_by)
    values(v_sale.business_id,'income',v_total,'Venda',v_sale.payment_method,(v_now at time zone 'America/Sao_Paulo')::date,'sale',v_sale.id,'paid',auth.uid());
  return v_sale;
end; $$;
