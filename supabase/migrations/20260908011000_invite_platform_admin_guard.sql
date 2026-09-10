create or replace function public.accept_business_invite(p_token_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare i public.business_invites; selected_business uuid; business_name text; v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if private.is_platform_admin() then raise exception 'invite_platform_admin' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('business-acquisition:' || v_user_id::text,0));
  select business_id into selected_business from public.business_invites where token_hash=p_token_hash;
  if not found then raise exception 'invite_invalid' using errcode='22023'; end if;
  -- All invite mutations lock business first, then invite (no lock-order inversion).
  select name into business_name from public.businesses where id=selected_business for update;
  select * into i from public.business_invites where token_hash=p_token_hash for update;
  if not found or i.status<>'pending' then raise exception 'invite_unavailable' using errcode='22023'; end if;
  if i.expires_at<=clock_timestamp() then raise exception 'invite_expired' using errcode='22023'; end if;
  if exists(select 1 from public.business_members where business_id=i.business_id and role='owner')
    then raise exception 'invite_unavailable' using errcode='22023'; end if;
  if exists(select 1 from public.business_members m where m.user_id=v_user_id)
    then raise exception 'invite_member_exists' using errcode='23505'; end if;
  insert into public.business_members(business_id,user_id,role) values(i.business_id,v_user_id,'owner');
  update public.business_invites set status='accepted',accepted_by=v_user_id,accepted_at=clock_timestamp(),updated_at=clock_timestamp() where id=i.id;
  return jsonb_build_object('businessName',business_name);
end $$;
