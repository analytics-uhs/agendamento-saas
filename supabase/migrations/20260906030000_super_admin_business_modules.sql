-- Platform-only module management. No domain data or existing RLS is changed.
alter table public.business_modules
  add column updated_by uuid references auth.users(id) on delete set null;

create function public.get_platform_business_modules(p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not (select private.is_platform_admin()) then
    raise exception 'platform_admin_forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.businesses where id = p_business_id) then
    raise exception 'platform_admin_business_not_found' using errcode = 'P0002';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('module', m.module, 'enabled', m.enabled) order by m.module)
    from public.business_modules m where m.business_id = p_business_id), '[]'::jsonb);
end;
$$;

create function public.set_platform_business_module_enabled(p_business_id uuid, p_module text, p_enabled boolean)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare business_name text; final_enabled boolean;
begin
  if (select auth.uid()) is null or not (select private.is_platform_admin()) then
    raise exception 'platform_admin_forbidden' using errcode = '42501';
  end if;
  if p_business_id is null or p_module is null or p_module not in ('scheduling','management','fiscal') or p_enabled is null then
    raise exception 'platform_admin_invalid_module' using errcode = '22023';
  end if;
  -- The current /admin home still assumes scheduling. Enabling repairs legacy gaps.
  if p_module = 'scheduling' and not p_enabled then
    raise exception 'platform_admin_scheduling_required' using errcode = '22023';
  end if;
  select b.name into business_name from public.businesses b where b.id = p_business_id for key share;
  if not found then
    raise exception 'platform_admin_business_not_found' using errcode = 'P0002';
  end if;
  insert into public.business_modules as m (business_id, module, enabled, updated_by)
  values (p_business_id, p_module, p_enabled, (select auth.uid()))
  on conflict (business_id, module) do update
    set enabled = excluded.enabled, updated_by = excluded.updated_by, updated_at = now()
  returning m.enabled into final_enabled;
  return jsonb_build_object('business_id',p_business_id,'business_name',business_name,'module',p_module,'enabled',final_enabled);
end;
$$;

revoke all on function public.get_platform_business_modules(uuid) from public, anon, authenticated, service_role;
revoke all on function public.set_platform_business_module_enabled(uuid,text,boolean) from public, anon, authenticated, service_role;
grant execute on function public.get_platform_business_modules(uuid) to authenticated;
grant execute on function public.set_platform_business_module_enabled(uuid,text,boolean) to authenticated;
comment on table public.business_modules is 'Tenant modules: member read-only RLS; platform changes through guarded RPC, with last actor/time. Disabling never deletes domain data.';
