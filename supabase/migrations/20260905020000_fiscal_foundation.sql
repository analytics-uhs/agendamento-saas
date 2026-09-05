-- Local fiscal preparation only. No emission, provider calls or sale completion changes.
create table public.fiscal_documents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  sale_id uuid not null,
  document_type text not null default 'nfce' check (document_type='nfce'),
  status text not null default 'draft' check (status in ('draft','pending','processing','authorized','rejected','cancelled')),
  total_amount numeric(14,2) not null check (total_amount>=0 and total_amount<=999999999999.99),
  provider text, provider_document_id text, access_key text, document_number text,
  series text, protocol text, xml_url text, pdf_url text, error_code text, error_message text,
  prepared_at timestamptz, submitted_at timestamptz, authorized_at timestamptz,
  rejected_at timestamptz, cancelled_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(id,business_id), unique(business_id,sale_id,document_type),
  foreign key(sale_id,business_id) references public.sales(id,business_id)
);
create index fiscal_documents_list_idx on public.fiscal_documents(business_id,created_at desc,id);
create table public.fiscal_document_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  fiscal_document_id uuid not null, sale_item_id uuid not null, product_id uuid not null,
  description text not null check (char_length(btrim(description))>0),
  quantity numeric(14,3) not null check (quantity>0 and quantity<=99999999999.999),
  unit_price numeric(12,2) not null check (unit_price>=0 and unit_price<=9999999999.99),
  -- Preserve fractional-quantity multiplication exactly; round once at document total, as sales does.
  total_amount numeric(26,5) not null check (total_amount=quantity*unit_price),
  created_at timestamptz not null default now(),
  unique(fiscal_document_id,sale_item_id),
  foreign key(fiscal_document_id,business_id) references public.fiscal_documents(id,business_id),
  foreign key(sale_item_id,business_id) references public.sale_items(id,business_id),
  foreign key(product_id,business_id) references public.products(id,business_id)
);
create index fiscal_document_items_list_idx on public.fiscal_document_items(business_id,fiscal_document_id);

create function private.validate_fiscal_document() returns trigger
language plpgsql set search_path='' as $$
declare v_sale public.sales; v_total numeric;
begin
  if tg_op<>'INSERT' then raise exception 'fiscal_read_only' using errcode='55000'; end if;
  select * into v_sale from public.sales where id=new.sale_id and business_id=new.business_id for share;
  if not found or v_sale.status<>'completed' then raise exception 'fiscal_sale_unavailable' using errcode='23514'; end if;
  select round(sum(quantity*unit_price),2) into v_total from public.sale_items where sale_id=v_sale.id and business_id=new.business_id;
  if v_total is null or v_total<>v_sale.total_amount or new.total_amount<>v_total then
    raise exception 'fiscal_total_mismatch' using errcode='23514'; end if;
  if new.status<>'draft' or new.prepared_at is null
    or coalesce(new.provider,new.provider_document_id,new.access_key,new.document_number,new.series,new.protocol,new.xml_url,new.pdf_url,new.error_code,new.error_message) is not null
    or coalesce(new.submitted_at,new.authorized_at,new.rejected_at,new.cancelled_at) is not null then
    raise exception 'fiscal_local_draft_only' using errcode='23514'; end if;
  return new;
end; $$;
create trigger fiscal_documents_validate before insert or update or delete on public.fiscal_documents
for each row execute function private.validate_fiscal_document();

create function private.validate_fiscal_document_item() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_op<>'INSERT' then raise exception 'fiscal_read_only' using errcode='55000'; end if;
  if not exists (
    select 1 from public.fiscal_documents d
    join public.sale_items i on i.sale_id=d.sale_id and i.business_id=d.business_id
    join public.products p on p.id=i.product_id and p.business_id=i.business_id
    where d.id=new.fiscal_document_id and d.business_id=new.business_id
      and i.id=new.sale_item_id and i.product_id=new.product_id
      and i.quantity=new.quantity and i.unit_price=new.unit_price and p.name=new.description
  ) then raise exception 'fiscal_item_invalid' using errcode='23514'; end if;
  return new;
end; $$;
create trigger fiscal_document_items_validate before insert or update or delete on public.fiscal_document_items
for each row execute function private.validate_fiscal_document_item();
revoke all on function private.validate_fiscal_document(),private.validate_fiscal_document_item() from public,anon,authenticated,service_role;

alter table public.fiscal_documents enable row level security;
alter table public.fiscal_document_items enable row level security;
revoke all on public.fiscal_documents,public.fiscal_document_items from public,anon,authenticated,service_role;
grant select on public.fiscal_documents,public.fiscal_document_items to authenticated;
create policy fiscal_documents_read on public.fiscal_documents for select to authenticated
using ((select private.can_manage_business_module(business_id,'fiscal')));
create policy fiscal_document_items_read on public.fiscal_document_items for select to authenticated
using ((select private.can_manage_business_module(business_id,'fiscal')));

create function public.prepare_admin_fiscal_document(p_business_id uuid,p_sale_id uuid)
returns public.fiscal_documents language plpgsql security definer set search_path='' as $$
declare v_sale public.sales; v_document public.fiscal_documents; v_total numeric; v_count integer;
begin
  if auth.uid() is null or p_business_id is null
    or not private.can_manage_business_module(p_business_id,'fiscal') then
    raise exception 'fiscal_unauthorized' using errcode='42501'; end if;
  -- Same-sale calls serialize here. Unique origin remains the final duplicate barrier.
  select * into v_sale from public.sales where id=p_sale_id and business_id=p_business_id for update;
  if not found then raise exception 'fiscal_sale_unavailable' using errcode='42501'; end if;
  if v_sale.status<>'completed' then raise exception 'fiscal_sale_not_completed' using errcode='23514'; end if;
  select * into v_document from public.fiscal_documents
    where business_id=p_business_id and sale_id=p_sale_id and document_type='nfce';
  if found then return v_document; end if;
  select count(*),round(sum(quantity*unit_price),2) into v_count,v_total from public.sale_items
    where sale_id=p_sale_id and business_id=p_business_id;
  if v_count=0 then raise exception 'fiscal_sale_empty' using errcode='23514'; end if;
  if v_total<>v_sale.total_amount then raise exception 'fiscal_total_mismatch' using errcode='23514'; end if;
  insert into public.fiscal_documents(business_id,sale_id,total_amount,prepared_at,created_by)
    values(p_business_id,p_sale_id,v_total,now(),auth.uid()) returning * into v_document;
  insert into public.fiscal_document_items(business_id,fiscal_document_id,sale_item_id,product_id,description,quantity,unit_price,total_amount)
    select p_business_id,v_document.id,i.id,i.product_id,p.name,i.quantity,i.unit_price,i.quantity*i.unit_price
    from public.sale_items i join public.products p on p.id=i.product_id and p.business_id=i.business_id
    where i.sale_id=p_sale_id and i.business_id=p_business_id;
  return v_document;
end; $$;
revoke all on function public.prepare_admin_fiscal_document(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.prepare_admin_fiscal_document(uuid,uuid) to authenticated;
