create or replace function public.create_admin_reservation(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid(); selected_business record; selected_group record; selected_option record;
  primary_payload jsonb; complementary_payload jsonb; primary_result jsonb; has_primary boolean; has_complementary boolean;
  primary_date date; complementary_date date; reservation_date date; primary_start time; complementary_start time; complementary_end time;
  complementary_mode public.booking_group_occupancy_mode; blocks integer; new_reservation_id uuid; new_resource_id uuid;
  customer_name text := pg_catalog.btrim(coalesce(p_payload->>'customer_name',''));
  customer_whatsapp text := pg_catalog.regexp_replace(coalesce(p_payload->>'customer_whatsapp',''),'\D','','g');
begin
  if current_user_id is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if coalesce(jsonb_typeof(p_payload),'') <> 'object' or exists(select 1 from jsonb_object_keys(p_payload) key(name) where key.name not in ('customer_name','customer_whatsapp','primary','complementary'))
    then raise exception 'reservation_payload_invalid' using errcode='22023'; end if;
  has_primary := p_payload?'primary' and jsonb_typeof(p_payload->'primary')='object';
  has_complementary := p_payload?'complementary' and jsonb_typeof(p_payload->'complementary')='object';
  if not has_primary and not has_complementary then raise exception 'reservation_payload_invalid' using errcode='22023'; end if;
  if char_length(customer_name) not between 2 and 120 or char_length(customer_whatsapp) not between 10 and 15 then raise exception 'reservation_invalid_customer' using errcode='22023'; end if;
  select business.id,business.name,business.slug,business.logo_url into selected_business
  from public.business_members membership join public.businesses business on business.id=membership.business_id
  where membership.user_id=current_user_id and membership.role in ('owner','admin') and business.active
  order by membership.created_at,membership.id limit 1;
  if not found then raise exception 'admin_reservation_forbidden' using errcode='42501'; end if;
  if has_primary then
    primary_payload:=p_payload->'primary';
    if exists(select 1 from jsonb_object_keys(primary_payload) key(name) where key.name not in ('group_1_option_id','group_2_option_id','date','start_time','blocks'))
      then raise exception 'reservation_payload_invalid' using errcode='22023'; end if;
    begin primary_date:=(primary_payload->>'date')::date; primary_start:=(primary_payload->>'start_time')::time; blocks:=coalesce((primary_payload->>'blocks')::integer,1);
    exception when invalid_text_representation or datetime_field_overflow then raise exception 'reservation_payload_invalid' using errcode='22023'; end;
    if primary_date is null or primary_start is null or blocks<1 then raise exception 'reservation_payload_invalid' using errcode='22023'; end if;
    reservation_date:=primary_date;
  end if;
  if has_complementary then
    complementary_payload:=p_payload->'complementary';
    if exists(select 1 from jsonb_object_keys(complementary_payload) key(name) where key.name not in ('option_id','occupancy_mode','date','start_time','end_time'))
      then raise exception 'reservation_payload_invalid' using errcode='22023'; end if;
    begin complementary_date:=(complementary_payload->>'date')::date; complementary_mode:=(complementary_payload->>'occupancy_mode')::public.booking_group_occupancy_mode; complementary_start:=nullif(complementary_payload->>'start_time','')::time; complementary_end:=nullif(complementary_payload->>'end_time','')::time;
    exception when invalid_text_representation or datetime_field_overflow then raise exception 'reservation_payload_invalid' using errcode='22023'; end;
    if complementary_date is null or nullif(complementary_payload->>'option_id','') is null then raise exception 'reservation_payload_invalid' using errcode='22023'; end if;
    if reservation_date is not null and reservation_date<>complementary_date then raise exception 'reservation_components_date_mismatch' using errcode='22023'; end if;
    reservation_date:=complementary_date;
    select booking_group.id,booking_group.label,booking_group.occupancy_mode into selected_group from public.booking_groups booking_group
    where booking_group.business_id=selected_business.id and booking_group.position=3 and booking_group.active;
    if not found or complementary_mode is distinct from selected_group.occupancy_mode then raise exception 'reservation_complementary_unavailable' using errcode='22023'; end if;
    begin select option.id,option.name into selected_option from public.booking_options option
      where option.id=(complementary_payload->>'option_id')::uuid and option.business_id=selected_business.id and option.group_id=selected_group.id and option.active;
    exception when invalid_text_representation then raise exception 'reservation_complementary_option_invalid' using errcode='22023'; end;
    if not found then raise exception 'reservation_complementary_option_invalid' using errcode='22023'; end if;
    if complementary_mode='day' and (complementary_start is not null or complementary_end is not null) then raise exception 'reservation_invalid_interval' using errcode='22023'; end if;
    if complementary_mode='time_slot' and (complementary_start is null or complementary_end is null or complementary_start>=private.normalize_end_of_day_time(complementary_start,complementary_end)) then raise exception 'reservation_invalid_interval' using errcode='22023'; end if;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(selected_business.id::text||':'||reservation_date::text,0));
  if has_complementary then perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(selected_business.id::text||':'||selected_option.id::text||':'||reservation_date::text,0)); end if;
  new_reservation_id:=private.create_reservation(selected_business.id,customer_name,customer_whatsapp,'admin',current_user_id);
  if has_primary then
    perform pg_catalog.set_config('app.reservation_id',new_reservation_id::text,true);
    begin primary_result:=public.create_admin_appointment(nullif(primary_payload->>'group_1_option_id','')::uuid,nullif(primary_payload->>'group_2_option_id','')::uuid,primary_date,primary_start,blocks,customer_name,customer_whatsapp);
    exception when exclusion_violation then raise exception 'reservation_primary_conflict' using errcode='23P01'; end;
    perform pg_catalog.set_config('app.reservation_id','',true);
  end if;
  if has_complementary then
    if exists(select 1 from public.resource_allocations allocation where allocation.business_id=selected_business.id and allocation.option_id=selected_option.id and allocation.active and allocation.occupied_period && private.complementary_period(complementary_mode,complementary_date,complementary_start,complementary_end))
      then raise exception 'reservation_complementary_conflict' using errcode='23P01'; end if;
    begin new_resource_id:=private.create_reservation_resource(new_reservation_id,selected_business.id,selected_group.id,selected_option.id,complementary_mode,complementary_date,complementary_start,complementary_end);
    exception when exclusion_violation then raise exception 'reservation_complementary_conflict' using errcode='23P01'; end;
  end if;
  return jsonb_build_object('reservation_id',new_reservation_id,'date',reservation_date,'primary',primary_result,'complementary_resource_id',new_resource_id);
end;
$$;

revoke all on function public.create_admin_reservation(jsonb) from public, anon;
grant execute on function public.create_admin_reservation(jsonb) to authenticated;

comment on function public.get_admin_complementary_availability(date,time,time) is 'Returns active complementary options while intentionally ignoring only public business hours.';
comment on function public.create_admin_reservation(jsonb) is 'Creates primary-only, complementary-only, or combined Admin reservations atomically without bypassing conflicts or allocations.';
