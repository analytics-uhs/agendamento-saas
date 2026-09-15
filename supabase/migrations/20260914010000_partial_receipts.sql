-- Receipts remain in financial_entries. Booking totals are independent obligations.
create table public.booking_financial_totals (
  business_id uuid not null references public.businesses(id),
  source_type text not null check (source_type in ('appointment','reservation')),
  source_id uuid not null,
  total_amount numeric(14,2) not null check (total_amount > 0 and total_amount <= 999999999999.99),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  reservation_id uuid generated always as (case when source_type='reservation' then source_id end) stored,
  appointment_id uuid generated always as (case when source_type='appointment' then source_id end) stored,
  primary key (source_type,source_id),
  foreign key (reservation_id,business_id) references public.reservations(id,business_id),
  foreign key (appointment_id) references public.appointments(id)
);
alter table public.booking_financial_totals enable row level security;
revoke all on public.booking_financial_totals from public,anon,authenticated,service_role;
grant select on public.booking_financial_totals to authenticated;
create policy booking_totals_read on public.booking_financial_totals for select to authenticated
using ((select private.can_manage_business_module(business_id,'management')));

-- One-time compatibility only: the former single entry established the amount due.
insert into public.booking_financial_totals(business_id,source_type,source_id,total_amount,created_by,created_at)
select business_id,source_type,source_id,amount,created_by,created_at
from public.financial_entries where source_type in ('appointment','reservation');

alter table public.financial_entries
  add column payer_name text check (payer_name is null or (payer_name=btrim(payer_name) and char_length(payer_name) between 1 and 160)),
  add column paid_at timestamptz,
  add column receipt_key uuid;
-- Historical receipts retain their original audit time; no financial value is changed.
-- Existing immutable rows need no update: reads use coalesce(paid_at,created_at).
drop index public.financial_origin_unique;
create index financial_origin_idx on public.financial_entries(business_id,source_type,source_id);
create unique index financial_receipt_key_unique on public.financial_entries(business_id,receipt_key) where receipt_key is not null;

-- Canonicalization and parent-row locking are shared by reads, total setup and writes.
-- Mutations on a sale already acquire the same row lock, serializing cart edits/closing/receipts.
create function private.lock_financial_origin(p_business_id uuid,p_source_type text,p_source_id uuid)
returns table(source_type text,source_id uuid,total numeric)
language plpgsql security definer set search_path='' as $$
declare v_reservation uuid; v_total numeric; v_type text:=p_source_type; v_id uuid:=p_source_id;
begin
  if auth.uid() is null or p_business_id is null or not private.can_manage_business_module(p_business_id,'management') then
    raise exception 'financial_unauthorized' using errcode='42501'; end if;
  if v_type='sale' then
    select total_amount into v_total from public.sales where id=v_id and business_id=p_business_id for update;
    if not found then raise exception 'financial_unauthorized' using errcode='42501'; end if;
  elsif v_type in ('appointment','reservation') then
    if v_type='appointment' then
      select reservation_id into v_reservation from public.appointments where id=v_id and business_id=p_business_id;
      if not found then raise exception 'financial_unauthorized' using errcode='42501'; end if;
      if v_reservation is not null then v_type:='reservation'; v_id:=v_reservation; end if;
    end if;
    if v_type='reservation' then
      perform 1 from public.reservations where id=v_id and business_id=p_business_id for update;
    else
      perform 1 from public.appointments where id=v_id and business_id=p_business_id and reservation_id is null for update;
    end if;
    if not found then raise exception 'financial_unauthorized' using errcode='42501'; end if;
    select total_amount into v_total from public.booking_financial_totals t
      where t.business_id=p_business_id and t.source_type=v_type and t.source_id=v_id;
  else raise exception 'financial_invalid' using errcode='22023'; end if;
  return query select v_type,v_id,v_total;
end; $$;
revoke all on function private.lock_financial_origin(uuid,text,uuid) from public,anon,authenticated,service_role;

create function private.guard_booking_financial_total() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_op<>'INSERT' then raise exception 'financial_total_immutable' using errcode='55000'; end if;
  if new.source_type='appointment' and not exists(select 1 from public.appointments where id=new.source_id and business_id=new.business_id and reservation_id is null) then
    raise exception 'financial_unauthorized' using errcode='42501'; end if;
  return new;
end; $$;
create trigger booking_financial_total_guard before insert or update or delete on public.booking_financial_totals
for each row execute function private.guard_booking_financial_total();
revoke all on function private.guard_booking_financial_total() from public,anon,authenticated,service_role;

create function public.set_admin_booking_financial_total(p_business_id uuid,p_source_type text,p_source_id uuid,p_total numeric)
returns void language plpgsql security definer set search_path='' as $$
declare v_origin record;
begin
  select * into v_origin from private.lock_financial_origin(p_business_id,p_source_type,p_source_id);
  if v_origin.source_type='sale' or p_total is null or p_total<=0 or p_total>999999999999.99 or p_total<>round(p_total,2) then
    raise exception 'financial_invalid' using errcode='22023'; end if;
  if v_origin.total is not null then
    if v_origin.total=p_total then return; end if;
    raise exception 'financial_total_immutable' using errcode='55000';
  end if;
  insert into public.booking_financial_totals(business_id,source_type,source_id,total_amount,created_by)
    values(p_business_id,v_origin.source_type,v_origin.source_id,p_total,auth.uid());
end; $$;

create or replace function private.validate_financial_entry() returns trigger
language plpgsql set search_path='' as $$
declare v_origin record; v_received numeric;
begin
  if tg_op<>'INSERT' then raise exception 'financial_read_only' using errcode='55000'; end if;
  if new.source_type<>'manual' then
    select * into v_origin from private.lock_financial_origin(new.business_id,new.source_type,new.source_id);
    if v_origin.source_type<>new.source_type or v_origin.source_id<>new.source_id then
      raise exception 'financial_appointment_invalid' using errcode='23514'; end if;
    if v_origin.total is null then raise exception 'financial_total_required' using errcode='23514'; end if;
    if new.status<>'paid' then raise exception 'financial_receipt_paid_required' using errcode='23514'; end if;
    select coalesce(sum(amount),0) into v_received from public.financial_entries
      where business_id=new.business_id and source_type=new.source_type and source_id=new.source_id and status='paid';
    if new.amount>v_origin.total-v_received then raise exception 'financial_exceeds_remaining' using errcode='23514'; end if;
    new.paid_at:=coalesce(new.paid_at,now());
  end if;
  return new;
end; $$;

create function public.register_admin_receipt(p_business_id uuid,p_source_type text,p_source_id uuid,p_amount numeric,p_payment_method text,p_payer_name text,p_receipt_key uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_origin record; v_entry public.financial_entries; v_payer text:=nullif(btrim(p_payer_name),'');
begin
  select * into v_origin from private.lock_financial_origin(p_business_id,p_source_type,p_source_id);
  if p_receipt_key is null or p_amount is null or p_amount<=0 or p_amount>999999999999.99 or p_amount<>round(p_amount,2)
    or p_payment_method is null or p_payment_method not in ('pix','cash','card','other') or char_length(v_payer)>160 then
    raise exception 'financial_invalid' using errcode='22023'; end if;
  select * into v_entry from public.financial_entries where business_id=p_business_id and receipt_key=p_receipt_key;
  if found then
    if v_entry.source_type<>v_origin.source_type or v_entry.source_id<>v_origin.source_id or v_entry.amount<>p_amount
      or v_entry.payment_method is distinct from p_payment_method or v_entry.payer_name is distinct from v_payer then
      raise exception 'financial_receipt_key_mismatch' using errcode='22023'; end if;
    return v_entry.id;
  end if;
  insert into public.financial_entries(business_id,entry_type,amount,description,payment_method,source_type,source_id,status,created_by,payer_name,paid_at,receipt_key)
    values(p_business_id,'income',p_amount,case when v_origin.source_type='sale' then 'Recebimento de venda' else 'Pagamento de agendamento' end,
      p_payment_method,v_origin.source_type,v_origin.source_id,'paid',auth.uid(),v_payer,now(),p_receipt_key) returning * into v_entry;
  return v_entry.id;
end; $$;

create function public.get_admin_origin_receipts(p_business_id uuid,p_source_type text,p_source_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_origin record; v_received numeric; v_entries jsonb;
begin
  select * into v_origin from private.lock_financial_origin(p_business_id,p_source_type,p_source_id);
  select coalesce(sum(amount) filter(where status='paid'),0),coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'amount',amount::text,'payment_method',payment_method,'payer_name',payer_name,
    'paid_at',coalesce(paid_at,created_at),'status',status) order by created_at,id),'[]'::jsonb)
    into v_received,v_entries from public.financial_entries
    where business_id=p_business_id and source_type=v_origin.source_type and source_id=v_origin.source_id;
  return jsonb_build_object('total',v_origin.total::text,'received',v_received::text,
    'remaining',(v_origin.total-v_received)::text,'entries',v_entries);
end; $$;

create function private.guard_sale_received_total() returns trigger language plpgsql set search_path='' as $$
declare v_received numeric;
begin
  select coalesce(sum(amount),0) into v_received from public.financial_entries
    where business_id=new.business_id and source_type='sale' and source_id=new.id and status='paid';
  if new.total_amount<v_received then raise exception 'financial_total_below_received' using errcode='23514'; end if;
  return new;
end; $$;
create trigger sales_received_total_guard before update of total_amount on public.sales
for each row execute function private.guard_sale_received_total();
revoke all on function private.guard_sale_received_total() from public,anon,authenticated,service_role;

-- The legacy entry API remains available, but shares canonical locking and balance enforcement.
create or replace function public.create_admin_financial_entry(
  p_business_id uuid,p_source_type text,p_source_id uuid,p_entry_type text,p_amount numeric,
  p_description text,p_payment_method text,p_entry_date date,p_status text
) returns public.financial_entries language plpgsql security definer set search_path='' as $$
declare v_origin record; v_type text:=p_source_type; v_id uuid:=p_source_id; v_result public.financial_entries;
begin
  if auth.uid() is null or p_business_id is null or not private.can_manage_business_module(p_business_id,'management') then
    raise exception 'financial_unauthorized' using errcode='42501'; end if;
  if p_source_type='manual' then
    if p_source_id is not null then raise exception 'financial_invalid' using errcode='22023'; end if;
  elsif p_source_type in ('appointment','reservation') then
    select * into v_origin from private.lock_financial_origin(p_business_id,p_source_type,p_source_id);
    v_type:=v_origin.source_type; v_id:=v_origin.source_id;
  else raise exception 'financial_invalid' using errcode='22023'; end if;
  if p_amount is null or p_amount<=0 or p_amount>999999999999.99 or p_amount<>round(p_amount,2)
    or p_entry_type is null or p_entry_type not in ('income','expense')
    or (v_type<>'manual' and p_entry_type<>'income')
    or p_status is null or p_status not in ('paid','pending') or p_entry_date is null then
    raise exception 'financial_invalid' using errcode='22023'; end if;
  insert into public.financial_entries(business_id,entry_type,amount,description,payment_method,entry_date,source_type,source_id,status,created_by)
    values(p_business_id,p_entry_type,p_amount,nullif(btrim(p_description),''),nullif(btrim(p_payment_method),''),p_entry_date,v_type,v_id,p_status,auth.uid())
    returning * into v_result;
  return v_result;
end; $$;

-- Closing still commits stock + financial remainder + completed in the same transaction.
create or replace function public.complete_admin_sale(p_sale_id uuid) returns public.sales
language plpgsql security definer set search_path='' as $$
declare v_sale public.sales; v_count integer; v_now timestamptz:=now(); v_total numeric(14,2); v_received numeric;
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
  select coalesce(sum(amount),0) into v_received from public.financial_entries
    where business_id=v_sale.business_id and source_type='sale' and source_id=v_sale.id and status='paid';
  update public.sales set total_amount=v_total,status='completed',completed_at=v_now where id=v_sale.id returning * into v_sale;
  insert into public.stock_movements(business_id,product_id,movement_type,quantity_delta,unit_cost,reason,source_type,source_id,created_by,occurred_at)
    select business_id,product_id,'sale',-quantity,null,'Venda finalizada','sale',id,auth.uid(),v_now from public.sale_items where sale_id=v_sale.id;
  if v_total>v_received then
    insert into public.financial_entries(business_id,entry_type,amount,description,payment_method,entry_date,source_type,source_id,status,created_by,paid_at)
      values(v_sale.business_id,'income',v_total-v_received,'Venda',v_sale.payment_method,(v_now at time zone 'America/Sao_Paulo')::date,'sale',v_sale.id,'paid',auth.uid(),v_now);
  end if;
  return v_sale;
end; $$;

revoke all on function public.set_admin_booking_financial_total(uuid,text,uuid,numeric),public.register_admin_receipt(uuid,text,uuid,numeric,text,text,uuid),public.get_admin_origin_receipts(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.set_admin_booking_financial_total(uuid,text,uuid,numeric),public.register_admin_receipt(uuid,text,uuid,numeric,text,text,uuid),public.get_admin_origin_receipts(uuid,text,uuid) to authenticated;
