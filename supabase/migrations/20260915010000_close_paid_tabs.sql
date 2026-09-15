-- Fully paid tabs close without inventing a payment method. Existing rows are unchanged.
alter table public.sales drop constraint sales_completion_shape;
alter table public.sales add constraint sales_completion_shape check (
  (status='draft' and completed_at is null) or
  (status='completed' and completed_at is not null and (payment_method is not null or sale_type='tab'))
);

create or replace function private.protect_completed_sale() returns trigger
language plpgsql set search_path='' as $$
declare v_received numeric;
begin
  if old.status='completed' then raise exception 'sale_completed_read_only' using errcode='55000'; end if;
  if new.status='completed' then
    if new.completed_at is null then raise exception 'sale_completion_invalid' using errcode='23514'; end if;
    if new.payment_method is null then
      select coalesce(sum(amount),0) into v_received from public.financial_entries
        where business_id=new.business_id and source_type='sale' and source_id=new.id and status='paid';
      if new.sale_type<>'tab' or new.total_amount<=0 or v_received<>new.total_amount then
        raise exception 'sale_completion_invalid' using errcode='23514'; end if;
    end if;
  end if;
  return new;
end; $$;

create or replace function public.complete_admin_sale(p_sale_id uuid) returns public.sales
language plpgsql security definer set search_path='' as $$
declare v_sale public.sales; v_count integer; v_now timestamptz:=now(); v_total numeric(14,2); v_received numeric;
begin
  if auth.uid() is null then raise exception 'sale_unauthorized' using errcode='42501'; end if;
  select * into v_sale from public.sales where id=p_sale_id for update;
  if not found or not private.can_manage_business_module(v_sale.business_id,'management') then
    raise exception 'sale_unavailable' using errcode='42501'; end if;
  if v_sale.status<>'draft' then raise exception 'sale_already_completed' using errcode='55000'; end if;
  select count(*),sum(quantity*unit_price) into v_count,v_total from public.sale_items where sale_id=v_sale.id;
  if v_count<1 then raise exception 'sale_empty' using errcode='23514'; end if;
  if v_total<=0 then raise exception 'sale_positive_total_required' using errcode='23514'; end if;
  select coalesce(sum(amount),0) into v_received from public.financial_entries
    where business_id=v_sale.business_id and source_type='sale' and source_id=v_sale.id and status='paid';
  if v_sale.payment_method is null and (v_sale.sale_type='quick' or v_received<v_total) then
    raise exception 'sale_payment_required' using errcode='23514'; end if;
  update public.sales set total_amount=v_total,status='completed',completed_at=v_now where id=v_sale.id returning * into v_sale;
  insert into public.stock_movements(business_id,product_id,movement_type,quantity_delta,unit_cost,reason,source_type,source_id,created_by,occurred_at)
    select business_id,product_id,'sale',-quantity,null,'Venda finalizada','sale',id,auth.uid(),v_now from public.sale_items where sale_id=v_sale.id;
  if v_total>v_received then
    insert into public.financial_entries(business_id,entry_type,amount,description,payment_method,entry_date,source_type,source_id,status,created_by,paid_at)
      values(v_sale.business_id,'income',v_total-v_received,'Venda',v_sale.payment_method,(v_now at time zone 'America/Sao_Paulo')::date,'sale',v_sale.id,'paid',auth.uid(),v_now);
  end if;
  return v_sale;
end; $$;

create or replace function public.complete_admin_copa_sale(p_business_id uuid,p_sale_id uuid,p_sale_type text,p_revision integer,p_payment_method text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_sale public.sales; v_received numeric; v_payment text:=nullif(btrim(p_payment_method),'');
begin
  if auth.uid() is null or not private.can_manage_business_module(p_business_id,'management') then raise exception 'copa_unauthorized' using errcode='42501'; end if;
  select * into v_sale from public.sales where id=p_sale_id and business_id=p_business_id for update;
  if not found or p_sale_type is null or v_sale.sale_type<>p_sale_type then raise exception 'copa_unavailable' using errcode='42501'; end if;
  if v_sale.status<>'draft' then raise exception 'sale_already_completed' using errcode='55000'; end if;
  if p_revision is distinct from v_sale.revision then raise exception 'copa_stale' using errcode='40001'; end if;
  select coalesce(sum(amount),0) into v_received from public.financial_entries
    where business_id=p_business_id and source_type='sale' and source_id=p_sale_id and status='paid';
  if (v_payment is null and (v_sale.sale_type='quick' or v_received<v_sale.total_amount))
    or (v_payment is not null and v_payment not in ('pix','cash','card')) then
    raise exception 'sale_payment_required' using errcode='23514'; end if;
  if exists(select 1 from public.sale_items i join public.products p on p.id=i.product_id where i.sale_id=p_sale_id and (i.quantity<>trunc(i.quantity) or p.unit<>'UN')) then
    raise exception 'copa_integer_quantity_required' using errcode='22023'; end if;
  perform set_config('app.copa_write','on',true);
  update public.sales set payment_method=v_payment where id=p_sale_id;
  -- Exactly the existing engine: completed + negative ledger + paid income in one transaction.
  perform public.complete_admin_sale(p_sale_id);
  perform set_config('app.copa_write','off',true);
  return p_sale_id;
end; $$;
