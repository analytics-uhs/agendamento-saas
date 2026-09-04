-- Minimal purchases flow: drafts are commercial records; confirmation writes the stock ledger atomically.
create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  status text not null default 'draft' check (status in ('draft','confirmed')),
  supplier_name text check (supplier_name is null or (supplier_name=btrim(supplier_name) and char_length(supplier_name) between 1 and 160)),
  purchase_date date not null,
  notes text check (notes is null or (notes=btrim(notes) and char_length(notes) between 1 and 1000)),
  total_amount numeric(14,2) not null default 0 check (total_amount>=0),
  confirmed_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,business_id),
  constraint purchases_confirmation_shape check ((status='draft' and confirmed_at is null) or (status='confirmed' and confirmed_at is not null))
);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  purchase_id uuid not null,
  product_id uuid not null,
  quantity numeric(14,3) not null check (quantity>0 and quantity<='99999999999.999'),
  unit_cost numeric(12,2) not null check (unit_cost>=0 and unit_cost<='9999999999.99'),
  created_at timestamptz not null default now(),
  unique(purchase_id,product_id),
  unique(id,business_id),
  constraint purchase_items_purchase_tenant_fk foreign key(purchase_id,business_id) references public.purchases(id,business_id) on delete cascade,
  constraint purchase_items_product_tenant_fk foreign key(product_id,business_id) references public.products(id,business_id)
);

create index purchases_list_idx on public.purchases(business_id,purchase_date desc,created_at desc);
create index purchase_items_purchase_idx on public.purchase_items(business_id,purchase_id);
create trigger purchases_set_updated_at before update on public.purchases for each row execute function private.set_updated_at();

create function private.protect_confirmed_purchase() returns trigger language plpgsql set search_path='' as $$
begin
  if old.status='confirmed' then raise exception 'purchase_confirmed_read_only' using errcode='55000'; end if;
  if new.status='confirmed' and new.confirmed_at is null then raise exception 'purchase_confirmation_invalid' using errcode='23514'; end if;
  return new;
end; $$;
create trigger purchases_protect_confirmed before update or delete on public.purchases for each row execute function private.protect_confirmed_purchase();

create function private.protect_confirmed_purchase_item() returns trigger language plpgsql set search_path='' as $$
declare v_purchase_id uuid:=coalesce(new.purchase_id,old.purchase_id); v_status text;
begin
  select status into v_status from public.purchases where id=v_purchase_id;
  if v_status is distinct from 'draft' then raise exception 'purchase_confirmed_read_only' using errcode='55000'; end if;
  return coalesce(new,old);
end; $$;
create trigger purchase_items_protect_confirmed before insert or update or delete on public.purchase_items for each row execute function private.protect_confirmed_purchase_item();

alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
revoke all on public.purchases,public.purchase_items from public,anon,authenticated,service_role;
grant select on public.purchases,public.purchase_items to authenticated;
create policy purchases_read on public.purchases for select to authenticated using ((select private.can_manage_business_module(business_id,'management')));
create policy purchase_items_read on public.purchase_items for select to authenticated using ((select private.can_manage_business_module(business_id,'management')));

alter table public.stock_movements drop constraint stock_movements_direction_check;
alter table public.stock_movements add constraint stock_movements_direction_check check (
  (movement_type in ('manual_in','adjustment_in','purchase') and quantity_delta>0) or
  (movement_type in ('manual_out','adjustment_out','loss') and quantity_delta<0) or movement_type='reversal'
);
alter table public.stock_movements drop constraint stock_movements_movement_type_check;
alter table public.stock_movements add constraint stock_movements_movement_type_check check (movement_type in ('manual_in','manual_out','adjustment_in','adjustment_out','loss','reversal','purchase'));
alter table public.stock_movements drop constraint stock_movements_source_type_check;
alter table public.stock_movements add constraint stock_movements_source_type_check check (source_type is null or source_type in ('manual','reversal','purchase'));
create unique index stock_movements_purchase_source_unique on public.stock_movements(source_id) where source_type='purchase';

create function public.save_admin_purchase_draft(
  p_purchase_id uuid,p_supplier_name text,p_purchase_date date,p_notes text,p_items jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_purchase public.purchases; v_business_id uuid; v_item jsonb; v_product public.products; v_seen uuid[]:='{}'; v_total numeric(14,2):=0; v_quantity numeric; v_cost numeric; v_product_id uuid;
begin
  if auth.uid() is null then raise exception 'purchase_unauthorized' using errcode='42501'; end if;
  if p_purchase_date is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>200 then raise exception 'purchase_invalid' using errcode='22023'; end if;
  if char_length(btrim(coalesce(p_supplier_name,'')))>160 or char_length(btrim(coalesce(p_notes,'')))>1000 then raise exception 'purchase_invalid' using errcode='22023'; end if;
  if p_purchase_id is not null then
    select * into v_purchase from public.purchases where id=p_purchase_id for update;
    if not found or v_purchase.status<>'draft' or not private.can_manage_business_module(v_purchase.business_id,'management') then raise exception 'purchase_unavailable' using errcode='42501'; end if;
    v_business_id:=v_purchase.business_id;
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    begin v_product_id:=(v_item->>'product_id')::uuid; v_quantity:=(v_item->>'quantity')::numeric; v_cost:=(v_item->>'unit_cost')::numeric; exception when others then raise exception 'purchase_item_invalid' using errcode='22023'; end;
    if v_product_id=any(v_seen) or v_quantity<=0 or v_quantity>'99999999999.999' or v_cost<0 or v_cost>'9999999999.99' then raise exception 'purchase_item_invalid' using errcode='22023'; end if;
    select * into v_product from public.products where id=v_product_id;
    if not found then raise exception 'purchase_product_unavailable' using errcode='23503'; end if;
    if v_business_id is null then v_business_id:=v_product.business_id; end if;
    if v_product.business_id<>v_business_id then raise exception 'purchase_cross_tenant' using errcode='23503'; end if;
    v_seen:=array_append(v_seen,v_product_id); v_total:=v_total+(v_quantity*v_cost);
  end loop;
  if not private.can_manage_business_module(v_business_id,'management') then raise exception 'purchase_unauthorized' using errcode='42501'; end if;
  if p_purchase_id is null then
    insert into public.purchases(business_id,supplier_name,purchase_date,notes,total_amount,created_by) values(v_business_id,nullif(btrim(p_supplier_name),''),p_purchase_date,nullif(btrim(p_notes),''),v_total,auth.uid()) returning * into v_purchase;
  else
    update public.purchases set supplier_name=nullif(btrim(p_supplier_name),''),purchase_date=p_purchase_date,notes=nullif(btrim(p_notes),''),total_amount=v_total where id=p_purchase_id returning * into v_purchase;
    delete from public.purchase_items where purchase_id=v_purchase.id;
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    insert into public.purchase_items(business_id,purchase_id,product_id,quantity,unit_cost) values(v_business_id,v_purchase.id,(v_item->>'product_id')::uuid,(v_item->>'quantity')::numeric,(v_item->>'unit_cost')::numeric);
  end loop;
  return v_purchase.id;
end; $$;

create function public.confirm_admin_purchase(p_purchase_id uuid) returns public.purchases language plpgsql security definer set search_path='' as $$
declare v_purchase public.purchases; v_count integer; v_now timestamptz:=now();
begin
  if auth.uid() is null then raise exception 'purchase_unauthorized' using errcode='42501'; end if;
  select * into v_purchase from public.purchases where id=p_purchase_id for update;
  if not found or not private.can_manage_business_module(v_purchase.business_id,'management') then raise exception 'purchase_unavailable' using errcode='42501'; end if;
  if v_purchase.status<>'draft' then raise exception 'purchase_already_confirmed' using errcode='55000'; end if;
  select count(*) into v_count from public.purchase_items where purchase_id=v_purchase.id;
  if v_count<1 then raise exception 'purchase_empty' using errcode='23514'; end if;
  update public.purchases p set total_amount=(select sum(i.quantity*i.unit_cost) from public.purchase_items i where i.purchase_id=p.id),status='confirmed',confirmed_at=v_now where p.id=v_purchase.id returning * into v_purchase;
  insert into public.stock_movements(business_id,product_id,movement_type,quantity_delta,unit_cost,reason,source_type,source_id,created_by,occurred_at)
  select i.business_id,i.product_id,'purchase',i.quantity,i.unit_cost,'Compra confirmada','purchase',i.id,auth.uid(),v_now from public.purchase_items i where i.purchase_id=v_purchase.id;
  return v_purchase;
end; $$;

revoke all on function public.save_admin_purchase_draft(uuid,text,date,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.confirm_admin_purchase(uuid) from public,anon,authenticated,service_role;
grant execute on function public.save_admin_purchase_draft(uuid,text,date,text,jsonb) to authenticated;
grant execute on function public.confirm_admin_purchase(uuid) to authenticated;
comment on table public.purchases is 'Minimal purchase header; drafts do not affect stock.';
comment on table public.purchase_items is 'Purchase lines that generate one stock movement each only on confirmation.';
