create or replace function public.save_admin_purchase_draft(
  p_purchase_id uuid,p_supplier_name text,p_purchase_date date,p_notes text,p_items jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_purchase public.purchases; v_business_id uuid; v_item jsonb; v_product public.products; v_seen uuid[]:=array[]::uuid[]; v_total numeric(14,2):=0; v_quantity numeric; v_cost numeric; v_product_id uuid;
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
