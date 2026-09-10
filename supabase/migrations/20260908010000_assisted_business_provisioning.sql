-- Assisted provisioning reuses the base initialization; no synthetic owner.
create function private.create_business_base(p_name text, p_slug text, p_whatsapp text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_business_id uuid;
begin
  insert into public.businesses(name,slug,whatsapp)
  values (trim(p_name),lower(trim(p_slug)),nullif(trim(p_whatsapp),'')) returning id into v_business_id;
  insert into public.booking_groups(business_id,position,label,sort_order)
  values (v_business_id,1,'Grupo 1',1),(v_business_id,2,'Grupo 2',2);
  insert into public.business_hours(business_id,weekday,active,start_time,end_time)
  select v_business_id,weekday,weekday between 1 and 6,
    case when weekday=6 then '09:00'::time else '08:00'::time end,
    case when weekday=6 then '14:00'::time else '18:00'::time end
  from generate_series(0,6) weekday;
  insert into public.business_settings(business_id) values (v_business_id);
  return v_business_id;
end $$;
revoke all on function private.create_business_base(text,text,text) from public,anon,authenticated,service_role;

create or replace function public.create_business_with_owner(p_name text,p_slug text,p_whatsapp text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_business_id uuid; v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'authentication required' using errcode='42501'; end if;
  -- Shared with invite acceptance: onboarding and acceptance cannot race.
  perform pg_advisory_xact_lock(hashtextextended('business-acquisition:' || v_user_id::text,0));
  if exists(select 1 from public.business_members m where m.user_id=v_user_id)
    then raise exception 'user already has a business' using errcode='23505'; end if;
  v_business_id := private.create_business_base(p_name,p_slug,p_whatsapp);
  insert into public.business_members(business_id,user_id,role) values(v_business_id,v_user_id,'owner');
  return v_business_id;
end $$;

create table private.assisted_businesses (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  provisioned_by uuid references auth.users(id) on delete set null,
  provisioned_at timestamptz,
  configuration_access_by uuid references auth.users(id) on delete set null,
  configuration_access_at timestamptz
);
revoke all on table private.assisted_businesses from public,anon,authenticated,service_role;

create table public.business_invites (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  role text not null default 'owner' check(role='owner'),
  token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'pending' check(status in ('pending','accepted','revoked')),
  expires_at timestamptz not null default (now()+interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(expires_at>created_at),
  check((status='pending' and accepted_at is null and revoked_at is null)
     or (status='accepted' and accepted_at is not null and revoked_at is null)
     or (status='revoked' and revoked_at is not null and accepted_at is null))
);
create unique index business_invites_one_pending on public.business_invites(business_id,role) where status='pending';
create index business_invites_business_created on public.business_invites(business_id,created_at desc);
alter table public.business_invites enable row level security;
revoke all on table public.business_invites from public,anon,authenticated,service_role;

create function public.create_platform_provisioned_business(p_name text,p_slug text,p_whatsapp text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_business_id uuid;
begin
  if auth.uid() is null or not private.is_platform_admin() then raise exception 'platform_forbidden' using errcode='42501'; end if;
  v_business_id := private.create_business_base(p_name,p_slug,p_whatsapp);
  -- Empty groups must not imply mandatory options before configuration.
  update public.booking_groups set active=false where booking_groups.business_id=v_business_id;
  insert into private.assisted_businesses(business_id,provisioned_by,provisioned_at) values(v_business_id,auth.uid(),now());
  return v_business_id;
end $$;

create function public.authorize_platform_business_configuration(p_business_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare b public.businesses;
begin
  if auth.uid() is null or not private.is_platform_admin() then raise exception 'platform_forbidden' using errcode='42501'; end if;
  select * into b from public.businesses where id=p_business_id;
  if not found then raise exception 'business_not_found' using errcode='P0002'; end if;
  -- Last explicit configuration access, not an impersonation session or generic log.
  insert into private.assisted_businesses(business_id,configuration_access_by,configuration_access_at)
  values(b.id,auth.uid(),clock_timestamp()) on conflict(business_id) do update
  set configuration_access_by=excluded.configuration_access_by,configuration_access_at=excluded.configuration_access_at;
  return jsonb_build_object('id',b.id,'name',b.name,'slug',b.slug,'active',b.active);
end $$;

create function public.replace_platform_business_hours(p_business_id uuid,p_hours jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform public.authorize_platform_business_configuration(p_business_id);
  perform private.insert_business_hours_payload(p_business_id,p_hours);
  return true;
end $$;

create function public.get_platform_business_access(p_business_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare owner_info jsonb; invite_info jsonb;
begin
  if auth.uid() is null or not private.is_platform_admin() then raise exception 'platform_forbidden' using errcode='42501'; end if;
  if not exists(select 1 from public.businesses where id=p_business_id) then raise exception 'business_not_found' using errcode='P0002'; end if;
  select jsonb_build_object('name',p.name,'email',u.email,'since',m.created_at) into owner_info
  from public.business_members m join auth.users u on u.id=m.user_id left join public.profiles p on p.id=m.user_id
  where m.business_id=p_business_id and m.role='owner' order by m.created_at,m.id limit 1;
  select jsonb_build_object('createdAt',created_at,'expiresAt',expires_at,
    'status',case when status='pending' and expires_at<=clock_timestamp() then 'expired' else status end)
    into invite_info from public.business_invites where business_id=p_business_id order by created_at desc,id desc limit 1;
  return jsonb_build_object('status',case when owner_info is not null then 'active'
    when invite_info->>'status'='pending' then 'waiting' else 'preparation' end,'owner',owner_info,'invite',invite_info);
end $$;

create function public.generate_platform_business_invite(p_business_id uuid,p_token_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare expiry timestamptz;
begin
  if auth.uid() is null or not private.is_platform_admin() then raise exception 'platform_forbidden' using errcode='42501'; end if;
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'invite_invalid' using errcode='22023'; end if;
  perform 1 from public.businesses where id=p_business_id for update;
  if not found then raise exception 'business_not_found' using errcode='P0002'; end if;
  if exists(select 1 from public.business_members where business_id=p_business_id and role='owner')
    then raise exception 'invite_owner_exists' using errcode='23505'; end if;
  update public.business_invites set status='revoked',revoked_at=clock_timestamp(),updated_at=clock_timestamp()
    where business_id=p_business_id and status='pending';
  insert into public.business_invites(business_id,token_hash,created_by) values(p_business_id,p_token_hash,auth.uid()) returning expires_at into expiry;
  return jsonb_build_object('expiresAt',expiry);
end $$;

create function public.revoke_platform_business_invite(p_business_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_platform_admin() then raise exception 'platform_forbidden' using errcode='42501'; end if;
  perform 1 from public.businesses where id=p_business_id for update;
  if not found then raise exception 'business_not_found' using errcode='P0002'; end if;
  update public.business_invites set status='revoked',revoked_at=clock_timestamp(),updated_at=clock_timestamp()
    where business_id=p_business_id and status='pending';
  return true;
end $$;

create function public.get_business_invite_public(p_token_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare i public.business_invites; business_name text;
begin
  select * into i from public.business_invites where token_hash=p_token_hash;
  if not found then return jsonb_build_object('status','invalid'); end if;
  if i.status<>'pending' then return jsonb_build_object('status',i.status); end if;
  if i.expires_at<=clock_timestamp() then return jsonb_build_object('status','expired'); end if;
  if exists(select 1 from public.business_members where business_id=i.business_id and role='owner') then return jsonb_build_object('status','revoked'); end if;
  select name into business_name from public.businesses where id=i.business_id;
  return jsonb_build_object('status','pending','businessName',business_name);
end $$;

create function public.accept_business_invite(p_token_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare i public.business_invites; selected_business uuid; business_name text; v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode='42501'; end if;
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

revoke all on function public.create_platform_provisioned_business(text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.authorize_platform_business_configuration(uuid) from public,anon,authenticated,service_role;
revoke all on function public.replace_platform_business_hours(uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.get_platform_business_access(uuid) from public,anon,authenticated,service_role;
revoke all on function public.generate_platform_business_invite(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.revoke_platform_business_invite(uuid) from public,anon,authenticated,service_role;
revoke all on function public.get_business_invite_public(text) from public,anon,authenticated,service_role;
revoke all on function public.accept_business_invite(text) from public,anon,authenticated,service_role;
grant execute on function public.create_platform_provisioned_business(text,text,text),
  public.authorize_platform_business_configuration(uuid), public.replace_platform_business_hours(uuid,jsonb),
  public.get_platform_business_access(uuid),public.generate_platform_business_invite(uuid,text),
  public.revoke_platform_business_invite(uuid),public.accept_business_invite(text) to authenticated;
grant execute on function public.get_business_invite_public(text) to anon,authenticated;
