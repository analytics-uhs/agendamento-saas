-- Immutable stock ledger. Stock balance is always derived from movements.
-- The applied catalog schema predates the composite key now present in its
-- local migration; this named index makes the tenant FK contract explicit.
create unique index if not exists products_stock_tenant_unique
on public.products(id,business_id);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  product_id uuid not null,
  movement_type text not null check (movement_type in ('manual_in','manual_out','adjustment_in','adjustment_out','loss','reversal')),
  quantity_delta numeric(14,3) not null check (quantity_delta <> 0 and quantity_delta < 'Infinity'::numeric and quantity_delta > '-Infinity'::numeric and quantity_delta <> 'NaN'::numeric),
  unit_cost numeric(12,2) check (unit_cost >= 0 and unit_cost < 'Infinity'::numeric and unit_cost <> 'NaN'::numeric),
  reason text check (reason is null or (reason=btrim(reason) and char_length(reason) between 1 and 500)),
  source_type text check (source_type is null or source_type in ('manual','reversal')),
  source_id uuid,
  reversal_of_id uuid,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (id,business_id),
  constraint stock_movements_product_tenant_fk foreign key(product_id,business_id)
    references public.products(id,business_id),
  constraint stock_movements_reversal_tenant_fk foreign key(reversal_of_id,business_id)
    references public.stock_movements(id,business_id),
  constraint stock_movements_direction_check check (
    (movement_type in ('manual_in','adjustment_in') and quantity_delta > 0) or
    (movement_type in ('manual_out','adjustment_out','loss') and quantity_delta < 0) or
    movement_type='reversal'
  ),
  constraint stock_movements_reversal_shape_check check (
    (movement_type='reversal' and reversal_of_id is not null and source_type='reversal') or
    (movement_type<>'reversal' and reversal_of_id is null)
  ),
  constraint stock_movements_reason_required_check check (
    movement_type not in ('adjustment_in','adjustment_out','loss') or reason is not null
  ),
  constraint stock_movements_not_self_reversal check (reversal_of_id is null or reversal_of_id<>id)
);

create index stock_movements_history_idx on public.stock_movements(business_id,product_id,occurred_at desc,created_at desc,id desc);
create unique index stock_movements_single_reversal_idx on public.stock_movements(reversal_of_id) where reversal_of_id is not null;

alter table public.stock_movements enable row level security;
revoke all on public.stock_movements from public,anon,authenticated,service_role;
grant select on public.stock_movements to authenticated;
create policy stock_movements_read on public.stock_movements for select to authenticated
using ((select private.can_manage_business_module(business_id,'management')));

create view public.product_stock_balances with (security_invoker=true) as
select p.business_id,p.id as product_id,p.category_id,p.name,p.sku,p.barcode,p.unit,p.minimum_stock,p.active,
       coalesce(sum(m.quantity_delta),0::numeric)::numeric(14,3) as quantity,
       case
         when coalesce(sum(m.quantity_delta),0)<0 then 'negative'
         when p.minimum_stock>0 and coalesce(sum(m.quantity_delta),0)<=p.minimum_stock then 'low'
         else 'normal'
       end as stock_status
from public.products p
left join public.stock_movements m on m.product_id=p.id and m.business_id=p.business_id
group by p.business_id,p.id;
revoke all on public.product_stock_balances from public,anon,authenticated,service_role;
grant select on public.product_stock_balances to authenticated;

create function public.create_admin_stock_movement(
  p_product_id uuid,p_movement_type text,p_quantity numeric,p_unit_cost numeric default null,
  p_reason text default null,p_occurred_at timestamptz default null
) returns public.stock_movements
language plpgsql security definer set search_path=''
as $$
declare v_product public.products; v_row public.stock_movements; v_delta numeric(14,3); v_reason text;
begin
  if auth.uid() is null then raise exception 'stock_unauthorized' using errcode='42501'; end if;
  select * into v_product from public.products where id=p_product_id;
  if not found or not private.can_manage_business_module(v_product.business_id,'management') then
    raise exception 'stock_product_unavailable' using errcode='42501';
  end if;
  if p_movement_type not in ('manual_in','manual_out','adjustment_in','adjustment_out','loss') then
    raise exception 'stock_movement_type_invalid' using errcode='22023';
  end if;
  if p_quantity is null or p_quantity<=0 or p_quantity>99999999999.999 then
    raise exception 'stock_quantity_invalid' using errcode='22023';
  end if;
  if p_unit_cost is not null and (p_unit_cost<0 or p_unit_cost>9999999999.99) then
    raise exception 'stock_unit_cost_invalid' using errcode='22023';
  end if;
  v_reason:=nullif(btrim(p_reason),'');
  if char_length(coalesce(v_reason,''))>500 or (p_movement_type in ('adjustment_in','adjustment_out','loss') and v_reason is null) then
    raise exception 'stock_reason_required' using errcode='22023';
  end if;
  v_delta:=case when p_movement_type in ('manual_in','adjustment_in') then p_quantity else -p_quantity end;
  insert into public.stock_movements(business_id,product_id,movement_type,quantity_delta,unit_cost,reason,source_type,created_by,occurred_at)
  values(v_product.business_id,v_product.id,p_movement_type,v_delta,p_unit_cost,v_reason,'manual',auth.uid(),coalesce(p_occurred_at,now()))
  returning * into v_row;
  return v_row;
end;
$$;

create function public.reverse_admin_stock_movement(p_movement_id uuid,p_reason text default null)
returns public.stock_movements language plpgsql security definer set search_path=''
as $$
declare v_original public.stock_movements; v_row public.stock_movements; v_reason text;
begin
  if auth.uid() is null then raise exception 'stock_unauthorized' using errcode='42501'; end if;
  select * into v_original from public.stock_movements where id=p_movement_id for update;
  if not found or not private.can_manage_business_module(v_original.business_id,'management') then
    raise exception 'stock_movement_unavailable' using errcode='42501';
  end if;
  if v_original.movement_type='reversal' then raise exception 'stock_reversal_not_reversible' using errcode='23514'; end if;
  if exists(select 1 from public.stock_movements where reversal_of_id=v_original.id) then
    raise exception 'stock_movement_already_reversed' using errcode='23505';
  end if;
  v_reason:=coalesce(nullif(btrim(p_reason),''),'Estorno de movimentação');
  if char_length(v_reason)>500 then raise exception 'stock_reason_invalid' using errcode='22023'; end if;
  insert into public.stock_movements(business_id,product_id,movement_type,quantity_delta,unit_cost,reason,source_type,reversal_of_id,created_by,occurred_at)
  values(v_original.business_id,v_original.product_id,'reversal',-v_original.quantity_delta,v_original.unit_cost,v_reason,'reversal',v_original.id,auth.uid(),now())
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.create_admin_stock_movement(uuid,text,numeric,numeric,text,timestamptz) from public,anon,authenticated,service_role;
revoke all on function public.reverse_admin_stock_movement(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.create_admin_stock_movement(uuid,text,numeric,numeric,text,timestamptz) to authenticated;
grant execute on function public.reverse_admin_stock_movement(uuid,text) to authenticated;

comment on table public.stock_movements is 'Immutable ledger and sole source of truth for product stock balances.';
comment on view public.product_stock_balances is 'Derived stock balance; never a mutable stock store.';
