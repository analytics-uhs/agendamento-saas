-- Additive homologation dispatch. No changes to sale/stock/financial semantics.
alter table public.product_fiscal_settings
  add column fiscal_unit text check (fiscal_unit is null or fiscal_unit ~ '^[A-Z0-9]{1,6}$'),
  add column fiscal_gtin text check (fiscal_gtin is null or fiscal_gtin='SEM GTIN' or fiscal_gtin ~ '^([0-9]{8}|[0-9]{12}|[0-9]{13}|[0-9]{14})$'),
  add column pis_code text check (pis_code is null or pis_code ~ '^[0-9]{2}$'),
  add column cofins_code text check (cofins_code is null or cofins_code ~ '^[0-9]{2}$');

create or replace function public.save_admin_product_fiscal_settings(p_business_id uuid,p_product_id uuid,p_data jsonb)
returns public.product_fiscal_settings language plpgsql security definer set search_path='' as $$
declare r public.product_fiscal_settings;
begin
  if auth.uid() is null or not private.can_manage_business_module(p_business_id,'fiscal') then
    raise exception 'fiscal_unauthorized' using errcode='42501'; end if;
  if p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'fiscal_settings_invalid' using errcode='22023'; end if;
  perform 1 from public.products where id=p_product_id and business_id=p_business_id for share;
  if not found then raise exception 'fiscal_unauthorized' using errcode='42501'; end if;
  insert into public.product_fiscal_settings(business_id,product_id,ncm,cest,cfop,origin,icms_code_type,icms_code,fiscal_unit,fiscal_gtin,pis_code,cofins_code)
  values(p_business_id,p_product_id,p_data->>'ncm',p_data->>'cest',p_data->>'cfop',p_data->>'origin',p_data->>'icms_code_type',p_data->>'icms_code',upper(p_data->>'fiscal_unit'),upper(p_data->>'fiscal_gtin'),p_data->>'pis_code',p_data->>'cofins_code')
  on conflict(product_id) do update set ncm=excluded.ncm,cest=excluded.cest,cfop=excluded.cfop,origin=excluded.origin,icms_code_type=excluded.icms_code_type,icms_code=excluded.icms_code,
    fiscal_unit=case when p_data?'fiscal_unit' then excluded.fiscal_unit else product_fiscal_settings.fiscal_unit end,
    fiscal_gtin=case when p_data?'fiscal_gtin' then excluded.fiscal_gtin else product_fiscal_settings.fiscal_gtin end,
    pis_code=case when p_data?'pis_code' then excluded.pis_code else product_fiscal_settings.pis_code end,
    cofins_code=case when p_data?'cofins_code' then excluded.cofins_code else product_fiscal_settings.cofins_code end
  returning * into r;
  return r;
end; $$;

alter table public.fiscal_documents
  add column provider_reference text unique,
  add column provider_environment text check (provider_environment='homologation'),
  add column provider_request_snapshot jsonb,
  add column provider_response_snapshot jsonb,
  add constraint fiscal_dispatch_snapshot check (
    (provider_reference is null and provider_environment is null and provider_request_snapshot is null)
    or (provider_reference is not null and provider_environment is not null and provider_reference='agendafacil-'||id::text and provider_environment='homologation'
      and provider='focus_nfe' and jsonb_typeof(provider_request_snapshot)='object'
      and provider_request_snapshot is not null and submitted_at is not null));

create table private.fiscal_dispatch_leases (
  document_id uuid primary key references public.fiscal_documents(id),
  token uuid not null, expires_at timestamptz not null
);
revoke all on private.fiscal_dispatch_leases from public,anon,authenticated,service_role;

create or replace function private.validate_fiscal_document() returns trigger
language plpgsql set search_path='' as $$
declare v_sale public.sales; v_total numeric;
begin
  if tg_op='DELETE' then raise exception 'fiscal_read_only' using errcode='55000'; end if;
  if tg_op='UPDATE' then
    if coalesce(current_setting('app.fiscal_dispatch',true),'')<>'on' then raise exception 'fiscal_read_only' using errcode='55000'; end if;
    if (to_jsonb(new)-array['status','provider','provider_reference','provider_environment','provider_request_snapshot','provider_response_snapshot','provider_document_id','access_key','document_number','series','protocol','xml_url','pdf_url','error_code','error_message','submitted_at','authorized_at','rejected_at','cancelled_at','updated_at'])
      is distinct from (to_jsonb(old)-array['status','provider','provider_reference','provider_environment','provider_request_snapshot','provider_response_snapshot','provider_document_id','access_key','document_number','series','protocol','xml_url','pdf_url','error_code','error_message','submitted_at','authorized_at','rejected_at','cancelled_at','updated_at']) then
      raise exception 'fiscal_read_only' using errcode='55000'; end if;
    if old.provider_reference is not null and row(new.provider_reference,new.provider_environment,new.provider_request_snapshot,new.provider,new.submitted_at)
      is distinct from row(old.provider_reference,old.provider_environment,old.provider_request_snapshot,old.provider,old.submitted_at) then
      raise exception 'fiscal_snapshot_immutable' using errcode='55000'; end if;
    new.updated_at:=now(); return new;
  end if;
  select * into v_sale from public.sales where id=new.sale_id and business_id=new.business_id for share;
  if not found or v_sale.status<>'completed' then raise exception 'fiscal_sale_unavailable' using errcode='23514'; end if;
  select round(sum(quantity*unit_price),2) into v_total from public.sale_items where sale_id=v_sale.id and business_id=new.business_id;
  if v_total is null or v_total<>v_sale.total_amount or new.total_amount<>v_total then raise exception 'fiscal_total_mismatch' using errcode='23514'; end if;
  if new.status<>'draft' or new.prepared_at is null
    or coalesce(new.provider,new.provider_document_id,new.access_key,new.document_number,new.series,new.protocol,new.xml_url,new.pdf_url,new.error_code,new.error_message,new.provider_reference,new.provider_environment) is not null
    or coalesce(new.submitted_at,new.authorized_at,new.rejected_at,new.cancelled_at) is not null
    or new.provider_request_snapshot is not null or new.provider_response_snapshot is not null then
    raise exception 'fiscal_local_draft_only' using errcode='23514'; end if;
  return new;
end; $$;

-- Stable, tenant-scoped inputs for optimistic snapshot validation (no browser payload authority).
create function private.fiscal_emission_context(p_business_id uuid,p_document_id uuid)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('document',to_jsonb(d)||jsonb_build_object('total_amount',d.total_amount::text),
    'business',to_jsonb(b),'payment_method',s.payment_method,'sale_status',s.status,
    'items',(select jsonb_agg(jsonb_build_object('id',i.id,'product_id',i.product_id,'description',i.description,
      'quantity',i.quantity::text,'unit_price',i.unit_price::text,'total_amount',i.total_amount::text,'settings',to_jsonb(p)) order by i.id)
      from public.fiscal_document_items i left join public.product_fiscal_settings p on p.product_id=i.product_id and p.business_id=i.business_id
      where i.fiscal_document_id=d.id and i.business_id=d.business_id))
  from public.fiscal_documents d join public.sales s on s.id=d.sale_id and s.business_id=d.business_id
  left join public.business_fiscal_settings b on b.business_id=d.business_id
  where d.id=p_document_id and d.business_id=p_business_id;
$$;
revoke all on function private.fiscal_emission_context(uuid,uuid) from public,anon,authenticated,service_role;

create function public.get_admin_fiscal_emission_context(p_business_id uuid,p_document_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not private.can_manage_business_module(p_business_id,'fiscal') then raise exception 'fiscal_unauthorized' using errcode='42501'; end if;
  return private.fiscal_emission_context(p_business_id,p_document_id);
end; $$;
revoke all on function public.get_admin_fiscal_emission_context(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_admin_fiscal_emission_context(uuid,uuid) to authenticated;

-- Service-only: a browser session cannot forge a provider result or an emission claim.
create function public.claim_fiscal_dispatch(p_business_id uuid,p_actor_id uuid,p_document_id uuid,p_context jsonb,p_request jsonb,p_emit boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.fiscal_documents; v_token uuid; v_method text; v_code text;
begin
  if auth.role() is distinct from 'service_role' or p_actor_id is null or not exists (
    select 1 from public.business_members m join public.business_modules b using(business_id)
    where m.business_id=p_business_id and m.user_id=p_actor_id and m.role in ('owner','admin') and b.module='fiscal' and b.enabled
  ) then raise exception 'fiscal_unauthorized' using errcode='42501'; end if;
  select * into d from public.fiscal_documents where id=p_document_id and business_id=p_business_id for update;
  if not found then raise exception 'fiscal_unauthorized' using errcode='42501'; end if;
  if exists(select 1 from private.fiscal_dispatch_leases where document_id=d.id and expires_at>now()) then return jsonb_build_object('busy',true); end if;
  if p_emit and d.status='draft' and d.provider_reference is null then
    -- Lock mutable fiscal settings briefly while validating the server's read snapshot.
    perform 1 from public.business_fiscal_settings where business_id=p_business_id for share;
    perform 1 from public.product_fiscal_settings where business_id=p_business_id and product_id in
      (select product_id from public.fiscal_document_items where fiscal_document_id=d.id) for share;
    if private.fiscal_emission_context(p_business_id,d.id) is distinct from p_context then raise exception 'fiscal_context_changed' using errcode='40001'; end if;
    if (p_context->'business'->>'environment') is distinct from 'homologation' then raise exception 'fiscal_production_blocked' using errcode='23514'; end if;
    if p_request is null or jsonb_typeof(p_request)<>'object' or jsonb_typeof(p_request->'items') is distinct from 'array'
      or (p_request->>'cnpj_emitente') is distinct from (p_context->'business'->>'cnpj')
      or jsonb_array_length(p_request->'items')<>(select count(*) from public.fiscal_document_items where fiscal_document_id=d.id)
      or jsonb_typeof(p_request->'formas_pagamento') is distinct from 'array' or jsonb_array_length(p_request->'formas_pagamento')<>1
      or (p_request->'formas_pagamento'->0->>'valor_pagamento')::numeric is distinct from d.total_amount then
      raise exception 'fiscal_request_invalid' using errcode='23514'; end if;
    v_method:=p_context->>'payment_method'; v_code:=p_request->'formas_pagamento'->0->>'forma_pagamento';
    if not coalesce((v_method='cash' and v_code='01') or (v_method='card' and v_code in ('03','04')) or (v_method='pix' and v_code in ('17','20','23')),false) then
      raise exception 'fiscal_payment_invalid' using errcode='23514'; end if;
    perform set_config('app.fiscal_dispatch','on',true);
    update public.fiscal_documents set status='pending',provider='focus_nfe',provider_reference='agendafacil-'||id::text,
      provider_environment='homologation',provider_request_snapshot=p_request,submitted_at=now() where id=d.id returning * into d;
    perform set_config('app.fiscal_dispatch','',true);
  else
    p_emit:=false;
    if d.provider_reference is null then raise exception 'fiscal_not_submitted' using errcode='23514'; end if;
  end if;
  v_token:=gen_random_uuid();
  insert into private.fiscal_dispatch_leases(document_id,token,expires_at) values(d.id,v_token,now()+interval '60 seconds')
    on conflict(document_id) do update set token=excluded.token,expires_at=excluded.expires_at;
  return jsonb_build_object('busy',false,'token',v_token,'emit',p_emit,'request',d.provider_request_snapshot,'environment',d.provider_environment);
end; $$;
revoke all on function public.claim_fiscal_dispatch(uuid,uuid,uuid,jsonb,jsonb,boolean) from public,anon,authenticated,service_role;
grant execute on function public.claim_fiscal_dispatch(uuid,uuid,uuid,jsonb,jsonb,boolean) to service_role;

create function public.record_fiscal_dispatch(p_business_id uuid,p_document_id uuid,p_token uuid,p_result jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare d public.fiscal_documents; v_status text:=p_result->>'status';
begin
  if auth.role() is distinct from 'service_role' then raise exception 'fiscal_unauthorized' using errcode='42501'; end if;
  select * into d from public.fiscal_documents where id=p_document_id and business_id=p_business_id for update;
  if not found or not exists(select 1 from private.fiscal_dispatch_leases where document_id=d.id and token=p_token) then return false; end if;
  if v_status is null or v_status not in ('pending','processing','authorized','rejected','cancelled') then raise exception 'fiscal_result_invalid' using errcode='23514'; end if;
  if v_status in ('authorized','cancelled') and coalesce(p_result->>'accessKey','') !~ '^[0-9]{44}$' then raise exception 'fiscal_result_invalid' using errcode='23514'; end if;
  -- Late/uncertain replies must not undo terminal facts; GET can report a later cancellation.
  if d.status='cancelled' or (d.status='authorized' and v_status<>'cancelled') or (d.status='rejected' and v_status in ('pending','processing')) then
    delete from private.fiscal_dispatch_leases where document_id=d.id and token=p_token; return true;
  end if;
  perform set_config('app.fiscal_dispatch','on',true);
  update public.fiscal_documents set status=v_status,
    provider_response_snapshot=jsonb_build_object('status',v_status,'httpStatus',p_result->'httpStatus','code',left(p_result->>'code',80)),
    access_key=coalesce(p_result->>'accessKey',access_key),document_number=coalesce(p_result->>'number',document_number),
    series=coalesce(p_result->>'series',series),protocol=coalesce(p_result->>'protocol',protocol),
    xml_url=coalesce(p_result->>'xmlUrl',xml_url),pdf_url=coalesce(p_result->>'danfceUrl',pdf_url),
    error_code=left(p_result->>'code',80),error_message=left(p_result->>'message',500),
    authorized_at=case when v_status='authorized' then coalesce(authorized_at,now()) else authorized_at end,
    rejected_at=case when v_status='rejected' then coalesce(rejected_at,now()) else rejected_at end,
    cancelled_at=case when v_status='cancelled' then coalesce(cancelled_at,now()) else cancelled_at end
    where id=d.id;
  perform set_config('app.fiscal_dispatch','',true);
  delete from private.fiscal_dispatch_leases where document_id=d.id and token=p_token;
  return true;
end; $$;
revoke all on function public.record_fiscal_dispatch(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.record_fiscal_dispatch(uuid,uuid,uuid,jsonb) to service_role;
