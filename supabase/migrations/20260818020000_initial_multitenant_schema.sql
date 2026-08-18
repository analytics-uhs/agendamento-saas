-- Core multi-tenant schema for AgendaFacil.
-- Weekdays use ISO-compatible numeric values: 0 = Sunday through 6 = Saturday.

create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create type public.business_role as enum ('owner', 'admin');
create type public.duration_mode as enum ('fixed', 'fixed_multiple', 'group_2');
create type public.theme_preference as enum ('light', 'dark', 'system');
create type public.appointment_status as enum (
  'scheduled',
  'completed',
  'cancelled',
  'no_show'
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  whatsapp text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  slug text not null check (
    slug = lower(slug)
    and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and char_length(slug) between 3 and 80
  ),
  whatsapp text,
  logo_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index businesses_slug_unique_ci on public.businesses (lower(slug));

create table public.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.business_role not null,
  created_at timestamptz not null default now(),
  constraint business_members_business_user_unique unique (business_id, user_id)
);

create index business_members_user_id_idx on public.business_members (user_id);
create index business_members_business_id_idx on public.business_members (business_id);

create table public.booking_groups (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  position smallint not null check (position in (1, 2)),
  label text not null check (char_length(trim(label)) between 1 and 80),
  active boolean not null default true,
  required boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_groups_business_position_unique unique (business_id, position),
  constraint booking_groups_id_business_unique unique (id, business_id)
);

create index booking_groups_business_sort_idx
  on public.booking_groups (business_id, sort_order, position);

create table public.booking_options (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  group_id uuid not null,
  name text not null check (char_length(trim(name)) between 1 and 120),
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_options_group_tenant_fk
    foreign key (group_id, business_id)
    references public.booking_groups (id, business_id)
    on delete cascade,
  constraint booking_options_id_business_unique unique (id, business_id)
);

create index booking_options_group_sort_idx
  on public.booking_options (group_id, sort_order, name);
create index booking_options_business_id_idx on public.booking_options (business_id);

create table public.business_hours (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  active boolean not null default true,
  start_time time not null default '08:00',
  end_time time not null default '18:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_hours_valid_range check (start_time < end_time),
  constraint business_hours_business_weekday_unique unique (business_id, weekday)
);

create table public.business_settings (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  duration_mode public.duration_mode not null default 'fixed',
  fixed_duration_minutes integer not null default 60 check (fixed_duration_minutes > 0),
  allow_multiple_blocks boolean not null default false,
  palette jsonb not null default '{"id":"original"}'::jsonb
    check (jsonb_typeof(palette) = 'object'),
  theme_preference public.theme_preference not null default 'system',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_settings_multiple_mode_consistent check (
    (duration_mode = 'fixed_multiple' and allow_multiple_blocks)
    or (duration_mode <> 'fixed_multiple' and not allow_multiple_blocks)
  )
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  group_1_option_id uuid,
  group_2_option_id uuid,
  customer_name text not null check (char_length(trim(customer_name)) between 2 and 120),
  customer_whatsapp text not null check (char_length(trim(customer_whatsapp)) between 8 and 30),
  appointment_date date not null,
  start_time time not null,
  end_time time not null,
  duration_minutes integer not null check (duration_minutes > 0),
  status public.appointment_status not null default 'scheduled',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  constraint appointments_valid_time_range check (start_time < end_time),
  constraint appointments_group_1_tenant_fk
    foreign key (group_1_option_id, business_id)
    references public.booking_options (id, business_id),
  constraint appointments_group_2_tenant_fk
    foreign key (group_2_option_id, business_id)
    references public.booking_options (id, business_id)
);

create index appointments_business_date_time_idx
  on public.appointments (business_id, appointment_date, start_time);
create index appointments_business_status_idx
  on public.appointments (business_id, status);

-- Platform-wide administrators live outside exposed API schemas. There is no
-- client-writable is_admin flag. Rows are provisioned only through privileged
-- SQL/service operations and consumed by the private RLS helper below.
create table private.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

alter table private.platform_admins enable row level security;
revoke all on table private.platform_admins from public, anon, authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create trigger businesses_set_updated_at
before update on public.businesses
for each row execute function private.set_updated_at();

create trigger booking_groups_set_updated_at
before update on public.booking_groups
for each row execute function private.set_updated_at();

create trigger booking_options_set_updated_at
before update on public.booking_options
for each row execute function private.set_updated_at();

create trigger business_hours_set_updated_at
before update on public.business_hours
for each row execute function private.set_updated_at();

create trigger business_settings_set_updated_at
before update on public.business_settings
for each row execute function private.set_updated_at();

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name, whatsapp)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(coalesce(new.email, ''), '@', 1),
      ''
    ),
    nullif(trim(new.raw_user_meta_data ->> 'whatsapp'), '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_auth_user();

insert into public.profiles (id, name, whatsapp)
select
  users.id,
  coalesce(
    nullif(trim(users.raw_user_meta_data ->> 'name'), ''),
    nullif(trim(users.raw_user_meta_data ->> 'full_name'), ''),
    split_part(coalesce(users.email, ''), '@', 1),
    ''
  ),
  nullif(trim(users.raw_user_meta_data ->> 'whatsapp'), '')
from auth.users as users
on conflict (id) do nothing;

create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.platform_admins
    where user_id = (select auth.uid())
  );
$$;

create or replace function private.is_business_member(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members
    where business_id = target_business_id
      and user_id = (select auth.uid())
  );
$$;

create or replace function private.has_business_role(
  target_business_id uuid,
  allowed_roles public.business_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members
    where business_id = target_business_id
      and user_id = (select auth.uid())
      and role = any(allowed_roles)
  );
$$;

revoke all on function private.is_platform_admin() from public;
revoke all on function private.is_business_member(uuid) from public;
revoke all on function private.has_business_role(uuid, public.business_role[]) from public;

grant execute on function private.is_platform_admin() to authenticated;
grant execute on function private.is_business_member(uuid) to authenticated;
grant execute on function private.has_business_role(uuid, public.business_role[]) to authenticated;

-- Prevent appointments from referencing an option in the wrong logical group.
-- Composite foreign keys above already guarantee that options belong to the
-- same business; this trigger additionally enforces group position.
create or replace function private.validate_appointment_options()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.group_1_option_id is not null and not exists (
    select 1
    from public.booking_options as booking_option
    join public.booking_groups as booking_group
      on booking_group.id = booking_option.group_id
     and booking_group.business_id = booking_option.business_id
    where booking_option.id = new.group_1_option_id
      and booking_option.business_id = new.business_id
      and booking_group.position = 1
  ) then
    raise exception 'group_1_option_id must reference position 1 in the same business';
  end if;

  if new.group_2_option_id is not null and not exists (
    select 1
    from public.booking_options as booking_option
    join public.booking_groups as booking_group
      on booking_group.id = booking_option.group_id
     and booking_group.business_id = booking_option.business_id
    where booking_option.id = new.group_2_option_id
      and booking_option.business_id = new.business_id
      and booking_group.position = 2
  ) then
    raise exception 'group_2_option_id must reference position 2 in the same business';
  end if;

  return new;
end;
$$;

create trigger appointments_validate_options
before insert or update of business_id, group_1_option_id, group_2_option_id
on public.appointments
for each row execute function private.validate_appointment_options();

-- Tenant ownership and audit attribution are immutable after creation. This
-- avoids moving a row between businesses or spoofing its creator in an update.
create or replace function private.preserve_appointment_ownership()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.business_id <> old.business_id then
    raise exception 'appointment business_id cannot be changed';
  end if;

  if new.created_by is distinct from old.created_by then
    raise exception 'appointment created_by cannot be changed';
  end if;

  return new;
end;
$$;

create trigger appointments_preserve_ownership
before update of business_id, created_by on public.appointments
for each row execute function private.preserve_appointment_ownership();

-- Owners cannot accidentally remove or demote the final owner of a business.
create or replace function private.preserve_last_business_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.role = 'owner'
    and (
      tg_op = 'DELETE'
      or (
        tg_op = 'UPDATE'
        and (new.role <> 'owner' or new.business_id <> old.business_id)
      )
    )
    and not exists (
    select 1
    from public.business_members
    where business_id = old.business_id
      and role = 'owner'
      and id <> old.id
  ) then
    raise exception 'a business must retain at least one owner';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger business_members_preserve_last_owner
before update or delete on public.business_members
for each row execute function private.preserve_last_business_owner();

-- Atomic onboarding primitive. Direct business inserts remain unavailable to
-- authenticated clients; this function creates the business and owner link.
create or replace function public.create_business_with_owner(
  p_name text,
  p_slug text,
  p_whatsapp text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_slug text := lower(trim(p_slug));
  new_business_id uuid;
begin
  if current_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if trim(p_name) = '' then
    raise exception 'business name is required' using errcode = '22023';
  end if;

  insert into public.businesses (name, slug, whatsapp)
  values (trim(p_name), normalized_slug, nullif(trim(p_whatsapp), ''))
  returning id into new_business_id;

  insert into public.business_members (business_id, user_id, role)
  values (new_business_id, current_user_id, 'owner');

  insert into public.booking_groups (business_id, position, label, sort_order)
  values
    (new_business_id, 1, 'Grupo 1', 1),
    (new_business_id, 2, 'Grupo 2', 2);

  insert into public.business_hours (business_id, weekday, active, start_time, end_time)
  select
    new_business_id,
    weekday,
    weekday between 1 and 6,
    case when weekday = 6 then '09:00'::time else '08:00'::time end,
    case when weekday = 6 then '14:00'::time else '18:00'::time end
  from generate_series(0, 6) as weekday;

  insert into public.business_settings (business_id)
  values (new_business_id);

  return new_business_id;
end;
$$;

revoke all on function public.create_business_with_owner(text, text, text) from public;
grant execute on function public.create_business_with_owner(text, text, text) to authenticated;

comment on schema private is
  'Unexposed authorization helpers and platform-only data. Never add this schema to Data API exposed schemas.';
comment on table private.platform_admins is
  'Platform-wide administrators provisioned only by privileged SQL/service operations.';
comment on function private.is_platform_admin() is
  'RLS helper that checks platform-wide access without exposing the backing table.';
comment on function private.is_business_member(uuid) is
  'Non-recursive RLS helper that checks membership using a fixed search_path.';
comment on function private.has_business_role(uuid, public.business_role[]) is
  'Non-recursive RLS helper for owner/admin authorization.';
comment on column public.business_hours.weekday is
  '0 = Sunday, 1 = Monday, ..., 6 = Saturday.';
