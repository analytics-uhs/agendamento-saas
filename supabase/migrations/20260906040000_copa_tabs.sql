-- Copa reuses the sales aggregate and the existing completion engine.
alter table public.sales
  add column sale_type text not null default 'quick' check (sale_type in ('quick','tab')),
  add column tab_name text,
  add column revision integer not null default 0 check (revision >= 0),
  add constraint sales_tab_name_check check (
    (sale_type='quick' and tab_name is null) or
    (sale_type='tab' and tab_name is not null and tab_name=btrim(tab_name) and char_length(tab_name) between 1 and 160));
create index sales_open_tabs_idx on public.sales(business_id,updated_at desc) where status='draft' and sale_type='tab';

create function private.guard_copa_sale() returns trigger language plpgsql set search_path='' as $$
begin
  if old.sale_type='tab' and current_setting('app.copa_write',true) is distinct from 'on' then
    raise exception 'copa_use_guarded_operation' using errcode='42501';
  end if;
  if tg_op='DELETE' then return old; end if;
  if new.sale_type is distinct from old.sale_type or new.tab_name is distinct from old.tab_name then
    raise exception 'copa_identity_immutable' using errcode='55000';
  end if;
  new.revision := old.revision+1;
  return new;
end; $$;
create trigger sales_copa_guard before update or delete on public.sales for each row execute function private.guard_copa_sale();

create function private.guard_copa_item() returns trigger language plpgsql set search_path='' as $$
declare v_sale public.sales;
begin
  select * into v_sale from public.sales where id=coalesce(new.sale_id,old.sale_id) for update;
  if v_sale.sale_type='tab' and current_setting('app.copa_write',true) is distinct from 'on' then
    raise exception 'copa_use_guarded_operation' using errcode='42501';
  end if;
  if tg_op<>'DELETE' and (v_sale.sale_type='tab' or current_setting('app.copa_write',true)='on')
    and new.quantity<>trunc(new.quantity) then
    raise exception 'copa_integer_quantity_required' using errcode='22023';
  end if;
  return coalesce(new,old);
end; $$;
create trigger sale_items_copa_guard before insert or update or delete on public.sale_items for each row execute function private.guard_copa_item();
revoke all on function private.guard_copa_sale(),private.guard_copa_item() from public,anon,authenticated,service_role;

create function public.open_admin_copa_sale(p_business_id uuid,p_sale_id uuid,p_sale_type text,p_tab_name text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_sale public.sales; v_name text:=nullif(btrim(p_tab_name),'');
begin
  if auth.uid() is null or not private.can_manage_business_module(p_business_id,'management') then raise exception 'copa_unauthorized' using errcode='42501'; end if;
  if p_sale_id is null or p_sale_type is null or p_sale_type not in ('quick','tab')
    or (p_sale_type='tab' and (v_name is null or char_length(v_name)>160))
    or (p_sale_type='quick' and v_name is not null) then raise exception 'copa_invalid' using errcode='22023'; end if;
  insert into public.sales(id,business_id,sale_type,tab_name,created_by)
    values(p_sale_id,p_business_id,p_sale_type,v_name,auth.uid()) on conflict(id) do nothing;
  select * into v_sale from public.sales where id=p_sale_id for update;
  if v_sale.business_id<>p_business_id or v_sale.sale_type<>p_sale_type or v_sale.tab_name is distinct from v_name or v_sale.status<>'draft' then
    raise exception 'copa_unavailable' using errcode='42501'; end if;
  return v_sale.id;
end; $$;

create function public.set_admin_copa_item(p_business_id uuid,p_sale_id uuid,p_sale_type text,p_revision integer,p_product_id uuid,p_quantity numeric)
returns integer language plpgsql security definer set search_path='' as $$
declare v_sale public.sales; v_product public.products; v_item public.sale_items; v_revision integer;
begin
  if auth.uid() is null or not private.can_manage_business_module(p_business_id,'management') then raise exception 'copa_unauthorized' using errcode='42501'; end if;
  select * into v_sale from public.sales where id=p_sale_id and business_id=p_business_id for update;
  if not found or v_sale.status<>'draft' or p_sale_type is null or v_sale.sale_type<>p_sale_type then raise exception 'copa_unavailable' using errcode='42501'; end if;
  if p_revision is distinct from v_sale.revision then raise exception 'copa_stale' using errcode='40001'; end if;
  if p_quantity is null or p_quantity<0 or p_quantity>99999999999 or p_quantity<>trunc(p_quantity) then raise exception 'copa_integer_quantity_required' using errcode='22023'; end if;
  select * into v_item from public.sale_items where sale_id=p_sale_id and product_id=p_product_id;
  if not found and p_quantity>0 then
    select * into v_product from public.products where id=p_product_id and business_id=p_business_id for share;
    if not found or not v_product.active or v_product.unit<>'UN' then raise exception 'copa_product_unavailable' using errcode='42501'; end if;
    if (select count(*) from public.sale_items where sale_id=p_sale_id)>=200 then raise exception 'copa_item_limit' using errcode='22023'; end if;
  end if;
  perform set_config('app.copa_write','on',true);
  if p_quantity=0 then delete from public.sale_items where sale_id=p_sale_id and product_id=p_product_id;
  elsif v_item.id is not null then update public.sale_items set quantity=p_quantity where id=v_item.id;
  else insert into public.sale_items(business_id,sale_id,product_id,quantity,unit_price) values(p_business_id,p_sale_id,p_product_id,p_quantity,v_product.sale_price); end if;
  update public.sales set total_amount=coalesce((select sum(quantity*unit_price) from public.sale_items where sale_id=p_sale_id),0)
    where id=p_sale_id returning revision into v_revision;
  perform set_config('app.copa_write','off',true);
  return v_revision;
end; $$;

create function public.complete_admin_copa_sale(p_business_id uuid,p_sale_id uuid,p_sale_type text,p_revision integer,p_payment_method text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_sale public.sales;
begin
  if auth.uid() is null or not private.can_manage_business_module(p_business_id,'management') then raise exception 'copa_unauthorized' using errcode='42501'; end if;
  select * into v_sale from public.sales where id=p_sale_id and business_id=p_business_id for update;
  if not found or p_sale_type is null or v_sale.sale_type<>p_sale_type then raise exception 'copa_unavailable' using errcode='42501'; end if;
  if v_sale.status<>'draft' then raise exception 'sale_already_completed' using errcode='55000'; end if;
  if p_revision is distinct from v_sale.revision then raise exception 'copa_stale' using errcode='40001'; end if;
  if p_payment_method is null or p_payment_method not in ('pix','cash','card') then raise exception 'sale_payment_required' using errcode='23514'; end if;
  if exists(select 1 from public.sale_items i join public.products p on p.id=i.product_id where i.sale_id=p_sale_id and (i.quantity<>trunc(i.quantity) or p.unit<>'UN')) then
    raise exception 'copa_integer_quantity_required' using errcode='22023'; end if;
  perform set_config('app.copa_write','on',true);
  update public.sales set payment_method=p_payment_method where id=p_sale_id;
  -- Exactly the existing engine: completed + negative ledger + paid income in one transaction.
  perform public.complete_admin_sale(p_sale_id);
  perform set_config('app.copa_write','off',true);
  return p_sale_id;
end; $$;
revoke all on function public.open_admin_copa_sale(uuid,uuid,text,text),public.set_admin_copa_item(uuid,uuid,text,integer,uuid,numeric),public.complete_admin_copa_sale(uuid,uuid,text,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.open_admin_copa_sale(uuid,uuid,text,text),public.set_admin_copa_item(uuid,uuid,text,integer,uuid,numeric),public.complete_admin_copa_sale(uuid,uuid,text,integer,text) to authenticated;
