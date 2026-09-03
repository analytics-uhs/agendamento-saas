-- Catalog only: no stock balance, movements, sales or fiscal fields.
create function private.can_manage_business_module(p_business_id uuid, p_module text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.has_business_role(p_business_id, array['owner','admin']::public.business_role[])
    and exists (select 1 from public.business_modules
      where business_id=p_business_id and module=p_module and enabled);
$$;
revoke all on function private.can_manage_business_module(uuid,text) from public, anon, authenticated, service_role;
grant execute on function private.can_manage_business_module(uuid,text) to authenticated;

create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (name=btrim(name) and char_length(name) between 1 and 80),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,business_id)
);
create unique index product_categories_name_unique on public.product_categories(business_id,lower(name));

create table public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  category_id uuid,
  name text not null check (name=btrim(name) and char_length(name) between 1 and 160),
  sku text check (sku is null or (sku=btrim(sku) and char_length(sku) between 1 and 64 and sku ~ '^[A-Za-z0-9._/-]+$')),
  barcode text check (barcode is null or (char_length(barcode) between 1 and 80 and barcode ~ '^[A-Za-z0-9._/-]+$')),
  unit text not null default 'UN' check (unit in ('UN','KG','G','L','ML')),
  cost_price numeric(12,2) check (cost_price >= 0 and cost_price < 'Infinity'::numeric and cost_price <> 'NaN'::numeric),
  sale_price numeric(12,2) not null default 0 check (sale_price >= 0 and sale_price < 'Infinity'::numeric and sale_price <> 'NaN'::numeric),
  minimum_stock numeric(12,3) not null default 0 check (minimum_stock >= 0 and minimum_stock < 'Infinity'::numeric and minimum_stock <> 'NaN'::numeric),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_category_tenant_fk foreign key(category_id,business_id)
    references public.product_categories(id,business_id)
);
create unique index products_sku_unique on public.products(business_id,lower(sku)) where sku is not null;
create unique index products_barcode_unique on public.products(business_id,barcode) where barcode is not null;
create index products_list_idx on public.products(business_id,name,id);
create index products_category_idx on public.products(business_id,category_id);

create function private.normalize_product_catalog()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.name := btrim(new.name);
  if tg_table_name='products' then
    new.sku := upper(nullif(btrim(new.sku),''));
    new.barcode := nullif(btrim(new.barcode),'');
    new.unit := upper(btrim(new.unit));
  end if;
  return new;
end;
$$;
revoke all on function private.normalize_product_catalog() from public, anon, authenticated, service_role;

-- Existing assignments to inactive categories remain editable. New assignments
-- must use an active category; FK remains the independent tenant boundary.
create function private.validate_product_category()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.category_id is not null and
    (tg_op='INSERT' or new.category_id is distinct from old.category_id) then
    if not exists(select 1 from public.product_categories
      where id=new.category_id and business_id=new.business_id and active) then
      raise exception 'product_category_unavailable' using errcode='23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.validate_product_category() from public, anon, authenticated, service_role;

create trigger product_categories_normalize before insert or update on public.product_categories
for each row execute function private.normalize_product_catalog();
create trigger products_normalize before insert or update on public.products
for each row execute function private.normalize_product_catalog();
create trigger products_validate_category before insert or update on public.products
for each row execute function private.validate_product_category();
create trigger product_categories_set_updated_at before update on public.product_categories
for each row execute function private.set_updated_at();
create trigger products_set_updated_at before update on public.products
for each row execute function private.set_updated_at();

alter table public.product_categories enable row level security;
alter table public.products enable row level security;
revoke all on public.product_categories,public.products from public,anon,authenticated,service_role;
grant select,insert on public.product_categories,public.products to authenticated;
grant update(name,active) on public.product_categories to authenticated;
grant update(category_id,name,sku,barcode,unit,cost_price,sale_price,minimum_stock,active) on public.products to authenticated;

create policy product_categories_read on public.product_categories for select to authenticated
using ((select private.can_manage_business_module(business_id,'management')));
create policy product_categories_insert on public.product_categories for insert to authenticated
with check ((select private.can_manage_business_module(business_id,'management')));
create policy product_categories_update on public.product_categories for update to authenticated
using ((select private.can_manage_business_module(business_id,'management')))
with check ((select private.can_manage_business_module(business_id,'management')));
create policy products_read on public.products for select to authenticated
using ((select private.can_manage_business_module(business_id,'management')));
create policy products_insert on public.products for insert to authenticated
with check ((select private.can_manage_business_module(business_id,'management')));
create policy products_update on public.products for update to authenticated
using ((select private.can_manage_business_module(business_id,'management')))
with check ((select private.can_manage_business_module(business_id,'management')));

comment on column public.products.minimum_stock is 'Configuration only. Actual stock will be derived from a future movements ledger.';
comment on column public.products.cost_price is 'Optional reference cost, not inventory average cost.';
