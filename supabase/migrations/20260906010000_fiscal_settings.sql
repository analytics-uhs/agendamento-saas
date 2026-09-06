-- Fiscal registration only; no changes to sales, snapshots or external emission.
create table public.business_fiscal_settings (
 business_id uuid primary key references public.businesses(id),
 legal_name text,
trade_name text,
cnpj text,
state_registration text,
tax_regime text,
environment text not null default 'homologation',
address_street text,
address_number text,
address_complement text,
address_neighborhood text,
address_city text,
address_city_code text,
address_state text,
address_zip_code text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(cnpj is null or cnpj ~ '^[0-9]{14}$'),
 check(address_zip_code is null or address_zip_code ~ '^[0-9]{8}$'),
 check(address_city_code is null or address_city_code ~ '^[0-9]{7}$'),
 check(address_state is null or address_state ~ '^[A-Z]{2}$'),
 check(tax_regime in ('1','2','3')),
 check(environment in ('homologation','production'))
);
create table public.product_fiscal_settings (
 product_id uuid primary key, business_id uuid not null references public.businesses(id),
 ncm text,
cest text,
cfop text,
origin text,
icms_code_type text,
icms_code text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(product_id,business_id) references public.products(id,business_id),
 check(ncm is null or ncm ~ '^[0-9]{8}$'),
 check(cest is null or cest ~ '^[0-9]{7}$'),
 check(cfop is null or cfop ~ '^[0-9]{4}$'),
 check(origin is null or origin ~ '^[0-8]$'),
 check(icms_code_type in ('csosn','cst')),
 check(icms_code is null or (icms_code_type='csosn' and icms_code ~ '^[0-9]{3}$') or (icms_code_type='cst' and icms_code ~ '^[0-9]{2}$')),
 check(icms_code is null or icms_code_type is not null)
);
create index product_fiscal_settings_tenant_idx on public.product_fiscal_settings(business_id,product_id);
-- Normalize at the database boundary, including privileged writes.
create function private.normalize_fiscal_settings() returns trigger language plpgsql set search_path='' as $$
declare v jsonb:=to_jsonb(new); k text; t text;
begin
 for k,t in select key,value from jsonb_each_text(v) where key not in ('business_id','product_id','created_at','updated_at') loop
   t:=nullif(btrim(t),'');
   if length(t)>200 then raise exception 'fiscal_settings_invalid' using errcode='22023'; end if;
   if k in ('cnpj','address_zip_code','address_city_code','ncm','cest','cfop') and t is not null then
     if t !~ '^[0-9 ./-]+$' then raise exception 'fiscal_settings_invalid' using errcode='22023'; end if;
     t:=regexp_replace(t,'[^0-9]','','g');
   end if;
   if k in ('address_state','state_registration') then t:=upper(t); end if;
   v:=v||jsonb_build_object(k,t);
 end loop;
 new:=jsonb_populate_record(new,v);
 new.updated_at:=now();
 return new;
end; $$;
revoke all on function private.normalize_fiscal_settings() from public,anon,authenticated,service_role;

create trigger business_fiscal_normalize before insert or update on public.business_fiscal_settings for each row execute function private.normalize_fiscal_settings();
alter table public.business_fiscal_settings enable row level security;
revoke all on public.business_fiscal_settings from public,anon,authenticated,service_role;
grant select on public.business_fiscal_settings to authenticated;
create policy business_fiscal_read on public.business_fiscal_settings for select to authenticated using ((select private.can_manage_business_module(business_id,'fiscal')));


create trigger product_fiscal_normalize before insert or update on public.product_fiscal_settings for each row execute function private.normalize_fiscal_settings();
alter table public.product_fiscal_settings enable row level security;
revoke all on public.product_fiscal_settings from public,anon,authenticated,service_role;
grant select on public.product_fiscal_settings to authenticated;
create policy product_fiscal_read on public.product_fiscal_settings for select to authenticated using ((select private.can_manage_business_module(business_id,'fiscal')));

create function public.save_admin_business_fiscal_settings(p_business_id uuid,p_data jsonb)
returns public.business_fiscal_settings language plpgsql security definer set search_path='' as $$
declare r public.business_fiscal_settings;
begin
 if auth.uid() is null or p_business_id is null or not private.can_manage_business_module(p_business_id,'fiscal') then
   raise exception 'fiscal_unauthorized' using errcode='42501'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'fiscal_settings_invalid' using errcode='22023'; end if;

 insert into public.business_fiscal_settings(business_id,legal_name,trade_name,cnpj,state_registration,tax_regime,environment,address_street,address_number,address_complement,address_neighborhood,address_city,address_city_code,address_state,address_zip_code)
 values(p_business_id,p_data->>'legal_name',p_data->>'trade_name',p_data->>'cnpj',p_data->>'state_registration',p_data->>'tax_regime',coalesce(nullif(p_data->>'environment',''),'homologation'),p_data->>'address_street',p_data->>'address_number',p_data->>'address_complement',p_data->>'address_neighborhood',p_data->>'address_city',p_data->>'address_city_code',p_data->>'address_state',p_data->>'address_zip_code')
 on conflict(business_id) do update set legal_name=excluded.legal_name,trade_name=excluded.trade_name,cnpj=excluded.cnpj,state_registration=excluded.state_registration,tax_regime=excluded.tax_regime,environment=excluded.environment,address_street=excluded.address_street,address_number=excluded.address_number,address_complement=excluded.address_complement,address_neighborhood=excluded.address_neighborhood,address_city=excluded.address_city,address_city_code=excluded.address_city_code,address_state=excluded.address_state,address_zip_code=excluded.address_zip_code
 returning * into r;
 return r;
end; $$;
revoke all on function public.save_admin_business_fiscal_settings(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.save_admin_business_fiscal_settings(uuid,jsonb) to authenticated;
create function public.save_admin_product_fiscal_settings(p_business_id uuid,p_product_id uuid,p_data jsonb)
returns public.product_fiscal_settings language plpgsql security definer set search_path='' as $$
declare r public.product_fiscal_settings;
begin
 if auth.uid() is null or p_business_id is null or not private.can_manage_business_module(p_business_id,'fiscal') then
   raise exception 'fiscal_unauthorized' using errcode='42501'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'fiscal_settings_invalid' using errcode='22023'; end if;
 perform 1 from public.products where id=p_product_id and business_id=p_business_id for share;
 if not found then raise exception 'fiscal_unauthorized' using errcode='42501'; end if;
 insert into public.product_fiscal_settings(business_id,product_id,ncm,cest,cfop,origin,icms_code_type,icms_code)
 values(p_business_id,p_product_id,p_data->>'ncm',p_data->>'cest',p_data->>'cfop',p_data->>'origin',p_data->>'icms_code_type',p_data->>'icms_code')
 on conflict(product_id) do update set ncm=excluded.ncm,cest=excluded.cest,cfop=excluded.cfop,origin=excluded.origin,icms_code_type=excluded.icms_code_type,icms_code=excluded.icms_code
 returning * into r;
 return r;
end; $$;
revoke all on function public.save_admin_product_fiscal_settings(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.save_admin_product_fiscal_settings(uuid,uuid,jsonb) to authenticated;
