-- Tenant modules are platform-controlled, not client-editable settings.
create table public.business_modules (
  business_id uuid not null references public.businesses(id) on delete cascade,
  module text not null check (module in ('scheduling', 'management', 'fiscal')),
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, module)
);
alter table public.business_modules enable row level security;
revoke all on public.business_modules from public, anon, authenticated, service_role;
grant select on public.business_modules to authenticated;
create policy business_modules_select_member on public.business_modules
for select to authenticated
using ((select private.is_business_member(business_id)));
create trigger business_modules_set_updated_at
before update on public.business_modules
for each row execute function private.set_updated_at();

-- Business insert and all onboarding steps share the same transaction.
create function private.initialize_business_modules()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.business_modules (business_id, module, enabled)
  values (new.id, 'scheduling', true), (new.id, 'management', false), (new.id, 'fiscal', false)
  on conflict (business_id, module) do nothing;
  return new;
end;
$$;
revoke all on function private.initialize_business_modules() from public, anon, authenticated, service_role;
create trigger businesses_initialize_modules
after insert on public.businesses
for each row execute function private.initialize_business_modules();

insert into public.business_modules (business_id, module, enabled)
select b.id, m.module, m.enabled from public.businesses b
cross join (values ('scheduling', true), ('management', false), ('fiscal', false)) m(module, enabled)
on conflict (business_id, module) do nothing;
comment on table public.business_modules is
  'Platform-controlled tenant modules. Members can only read their own configuration. No activation API yet.';
