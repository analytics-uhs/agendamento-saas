-- Minimal sales/POS flow. Drafts do not affect stock; completion writes negative ledger movements atomically.
create table public.sales (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id),
 status text not null default 'draft' check(status in ('draft','completed')),
 customer_name text check(customer_name is null or (customer_name=btrim(customer_name) and char_length(customer_name) between 1 and 160)),
 payment_method text check(payment_method is null or payment_method in ('pix','cash','card')),
 total_amount numeric(14,2) not null default 0 check(total_amount>=0), completed_at timestamptz,
 created_by uuid default auth.uid() references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id,business_id), constraint sales_completion_shape check((status='draft' and completed_at is null) or (status='completed' and completed_at is not null and payment_method is not null))
);
create table public.sale_items (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id), sale_id uuid not null, product_id uuid not null,
 quantity numeric(14,3) not null check(quantity>0 and quantity<='99999999999.999'), unit_price numeric(12,2) not null check(unit_price>=0 and unit_price<='9999999999.99'), created_at timestamptz not null default now(),
 unique(sale_id,product_id), unique(id,business_id),
 constraint sale_items_sale_tenant_fk foreign key(sale_id,business_id) references public.sales(id,business_id) on delete cascade,
 constraint sale_items_product_tenant_fk foreign key(product_id,business_id) references public.products(id,business_id)
);
create index sales_list_idx on public.sales(business_id,created_at desc);
create index sale_items_sale_idx on public.sale_items(business_id,sale_id);
create trigger sales_set_updated_at before update on public.sales for each row execute function private.set_updated_at();

create function private.protect_completed_sale() returns trigger language plpgsql set search_path='' as $$ begin if old.status='completed' then raise exception 'sale_completed_read_only' using errcode='55000'; end if; if new.status='completed' and (new.completed_at is null or new.payment_method is null) then raise exception 'sale_completion_invalid' using errcode='23514'; end if; return new; end; $$;
create trigger sales_protect_completed before update or delete on public.sales for each row execute function private.protect_completed_sale();
create function private.protect_completed_sale_item() returns trigger language plpgsql set search_path='' as $$ declare v_sale_id uuid:=coalesce(new.sale_id,old.sale_id);v_status text;begin select status into v_status from public.sales where id=v_sale_id;if v_status is distinct from 'draft' then raise exception 'sale_completed_read_only' using errcode='55000';end if;return coalesce(new,old);end;$$;
create trigger sale_items_protect_completed before insert or update or delete on public.sale_items for each row execute function private.protect_completed_sale_item();

alter table public.sales enable row level security;alter table public.sale_items enable row level security;
revoke all on public.sales,public.sale_items from public,anon,authenticated,service_role;grant select on public.sales,public.sale_items to authenticated;
create policy sales_read on public.sales for select to authenticated using((select private.can_manage_business_module(business_id,'management')));
create policy sale_items_read on public.sale_items for select to authenticated using((select private.can_manage_business_module(business_id,'management')));

alter table public.stock_movements drop constraint stock_movements_direction_check;
alter table public.stock_movements add constraint stock_movements_direction_check check((movement_type in ('manual_in','adjustment_in','purchase') and quantity_delta>0) or (movement_type in ('manual_out','adjustment_out','loss','sale') and quantity_delta<0) or movement_type='reversal');
alter table public.stock_movements drop constraint stock_movements_movement_type_check;
alter table public.stock_movements add constraint stock_movements_movement_type_check check(movement_type in ('manual_in','manual_out','adjustment_in','adjustment_out','loss','reversal','purchase','sale'));
alter table public.stock_movements drop constraint stock_movements_source_type_check;
alter table public.stock_movements add constraint stock_movements_source_type_check check(source_type is null or source_type in ('manual','reversal','purchase','sale'));
create unique index stock_movements_sale_source_unique on public.stock_movements(source_id) where source_type='sale';

create function public.save_admin_sale_draft(p_sale_id uuid,p_customer_name text,p_payment_method text,p_items jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare v_sale public.sales;v_business_id uuid;v_item jsonb;v_product public.products;v_seen uuid[]:=array[]::uuid[];v_total numeric(14,2):=0;v_quantity numeric;v_price numeric;v_product_id uuid;v_payment text:=nullif(btrim(p_payment_method),'');
begin
 if auth.uid() is null then raise exception 'sale_unauthorized' using errcode='42501';end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>200 or char_length(btrim(coalesce(p_customer_name,'')))>160 or (v_payment is not null and v_payment not in ('pix','cash','card')) then raise exception 'sale_invalid' using errcode='22023';end if;
 if p_sale_id is not null then select * into v_sale from public.sales where id=p_sale_id for update;if not found or v_sale.status<>'draft' or not private.can_manage_business_module(v_sale.business_id,'management') then raise exception 'sale_unavailable' using errcode='42501';end if;v_business_id:=v_sale.business_id;end if;
 for v_item in select value from jsonb_array_elements(p_items) loop
  begin v_product_id:=(v_item->>'product_id')::uuid;v_quantity:=(v_item->>'quantity')::numeric;v_price:=(v_item->>'unit_price')::numeric;exception when others then raise exception 'sale_item_invalid' using errcode='22023';end;
  if v_product_id=any(v_seen) or v_quantity<=0 or v_quantity>'99999999999.999' or v_price<0 or v_price>'9999999999.99' then raise exception 'sale_item_invalid' using errcode='22023';end if;
  select * into v_product from public.products where id=v_product_id;if not found then raise exception 'sale_product_unavailable' using errcode='23503';end if;
  if v_business_id is null then v_business_id:=v_product.business_id;end if;if v_product.business_id<>v_business_id then raise exception 'sale_cross_tenant' using errcode='23503';end if;
  v_seen:=array_append(v_seen,v_product_id);v_total:=v_total+(v_quantity*v_price);
 end loop;
 if not private.can_manage_business_module(v_business_id,'management') then raise exception 'sale_unauthorized' using errcode='42501';end if;
 if p_sale_id is null then insert into public.sales(business_id,customer_name,payment_method,total_amount,created_by) values(v_business_id,nullif(btrim(p_customer_name),''),v_payment,v_total,auth.uid()) returning * into v_sale;
 else update public.sales set customer_name=nullif(btrim(p_customer_name),''),payment_method=v_payment,total_amount=v_total where id=p_sale_id returning * into v_sale;delete from public.sale_items where sale_id=v_sale.id;end if;
 for v_item in select value from jsonb_array_elements(p_items) loop insert into public.sale_items(business_id,sale_id,product_id,quantity,unit_price) values(v_business_id,v_sale.id,(v_item->>'product_id')::uuid,(v_item->>'quantity')::numeric,(v_item->>'unit_price')::numeric);end loop;
 return v_sale.id;
end;$$;

create function public.complete_admin_sale(p_sale_id uuid) returns public.sales language plpgsql security definer set search_path='' as $$
declare v_sale public.sales;v_count integer;v_now timestamptz:=now();begin
 if auth.uid() is null then raise exception 'sale_unauthorized' using errcode='42501';end if;
 select * into v_sale from public.sales where id=p_sale_id for update;if not found or not private.can_manage_business_module(v_sale.business_id,'management') then raise exception 'sale_unavailable' using errcode='42501';end if;
 if v_sale.status<>'draft' then raise exception 'sale_already_completed' using errcode='55000';end if;if v_sale.payment_method is null then raise exception 'sale_payment_required' using errcode='23514';end if;
 select count(*) into v_count from public.sale_items where sale_id=v_sale.id;if v_count<1 then raise exception 'sale_empty' using errcode='23514';end if;
 update public.sales s set total_amount=(select sum(i.quantity*i.unit_price) from public.sale_items i where i.sale_id=s.id),status='completed',completed_at=v_now where s.id=v_sale.id returning * into v_sale;
 insert into public.stock_movements(business_id,product_id,movement_type,quantity_delta,unit_cost,reason,source_type,source_id,created_by,occurred_at) select i.business_id,i.product_id,'sale',-i.quantity,null,'Venda finalizada','sale',i.id,auth.uid(),v_now from public.sale_items i where i.sale_id=v_sale.id;
 return v_sale;
end;$$;
revoke all on function public.save_admin_sale_draft(uuid,text,text,jsonb) from public,anon,authenticated,service_role;revoke all on function public.complete_admin_sale(uuid) from public,anon,authenticated,service_role;
grant execute on function public.save_admin_sale_draft(uuid,text,text,jsonb) to authenticated;grant execute on function public.complete_admin_sale(uuid) to authenticated;
comment on table public.sales is 'Minimal sales header; drafts do not affect stock.';comment on table public.sale_items is 'Sale lines that generate one negative stock movement each only on completion.';
