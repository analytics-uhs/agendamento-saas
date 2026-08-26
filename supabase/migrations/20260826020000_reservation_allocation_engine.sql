-- Reservation aggregate and complementary-resource allocation barrier.
-- Appointments remain the temporal authority for the primary group. This
-- migration is additive and intentionally does not backfill legacy bookings.

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_name text not null check (char_length(trim(customer_name)) between 2 and 120),
  customer_whatsapp text not null check (char_length(trim(customer_whatsapp)) between 8 and 30),
  source public.appointment_source not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservations_id_business_unique unique (id, business_id),
  constraint reservations_source_creator_check check (
    (source = 'public'::public.appointment_source and created_by is null)
    or source = 'admin'::public.appointment_source
  )
);

alter table public.appointments
  add column reservation_id uuid;

alter table public.appointments
  add constraint appointments_reservation_tenant_fk
  foreign key (reservation_id, business_id)
  references public.reservations (id, business_id)
  on delete restrict;

create index appointments_reservation_id_idx
  on public.appointments (reservation_id)
  where reservation_id is not null;

create table public.reservation_resources (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null,
  business_id uuid not null,
  group_id uuid not null,
  option_id uuid not null,
  occupancy_mode public.booking_group_occupancy_mode not null,
  reservation_date date not null,
  start_time time,
  end_time time,
  status public.appointment_status not null default 'scheduled',
  option_name_snapshot text not null check (char_length(trim(option_name_snapshot)) between 1 and 120),
  group_name_snapshot text not null check (char_length(trim(group_name_snapshot)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservation_resources_id_business_unique unique (id, business_id),
  constraint reservation_resources_reservation_tenant_fk
    foreign key (reservation_id, business_id)
    references public.reservations (id, business_id)
    on delete cascade,
  constraint reservation_resources_group_tenant_fk
    foreign key (group_id, business_id)
    references public.booking_groups (id, business_id)
    on delete restrict,
  constraint reservation_resources_option_tenant_fk
    foreign key (option_id, business_id)
    references public.booking_options (id, business_id)
    on delete restrict,
  constraint reservation_resources_occupancy_shape_check check (
    (
      occupancy_mode = 'day'::public.booking_group_occupancy_mode
      and start_time is null
      and end_time is null
    )
    or (
      occupancy_mode = 'time_slot'::public.booking_group_occupancy_mode
      and start_time is not null
      and end_time is not null
      and start_time < end_time
    )
  )
);

create table public.resource_allocations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  option_id uuid not null,
  reservation_resource_id uuid not null,
  occupancy_mode public.booking_group_occupancy_mode not null,
  allocation_date date not null,
  start_time time,
  end_time time,
  occupied_period tsrange generated always as (
    case
      when occupancy_mode = 'day'::public.booking_group_occupancy_mode then
        tsrange(allocation_date::timestamp, (allocation_date + 1)::timestamp, '[)')
      else
        tsrange(allocation_date + start_time, allocation_date + end_time, '[)')
    end
  ) stored,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint resource_allocations_resource_unique unique (reservation_resource_id),
  constraint resource_allocations_resource_tenant_fk
    foreign key (reservation_resource_id, business_id)
    references public.reservation_resources (id, business_id)
    on delete cascade,
  constraint resource_allocations_option_tenant_fk
    foreign key (option_id, business_id)
    references public.booking_options (id, business_id)
    on delete restrict,
  constraint resource_allocations_occupancy_shape_check check (
    (
      occupancy_mode = 'day'::public.booking_group_occupancy_mode
      and start_time is null
      and end_time is null
    )
    or (
      occupancy_mode = 'time_slot'::public.booking_group_occupancy_mode
      and start_time is not null
      and end_time is not null
      and start_time < end_time
    )
  ),
  constraint resource_allocations_no_overlap
    exclude using gist (
      business_id with =,
      option_id with =,
      occupied_period with &&
    ) where (active)
);

create index reservations_business_created_idx
  on public.reservations (business_id, created_at desc);
create index reservation_resources_reservation_idx
  on public.reservation_resources (reservation_id, created_at);
create index resource_allocations_business_option_date_idx
  on public.resource_allocations (business_id, option_id, allocation_date)
  where active;

create trigger reservations_set_updated_at
before update on public.reservations
for each row execute function private.set_updated_at();

create trigger reservation_resources_00_normalize_midnight_end
before insert or update of start_time, end_time on public.reservation_resources
for each row execute function private.normalize_midnight_end_time();

create trigger reservation_resources_set_updated_at
before update on public.reservation_resources
for each row execute function private.set_updated_at();

create or replace function private.validate_reservation_resource()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  selected_group record;
  selected_option record;
begin
  select booking_group.label, booking_group.occupancy_mode
  into selected_group
  from public.booking_groups as booking_group
  where booking_group.id = new.group_id
    and booking_group.business_id = new.business_id
    and booking_group.position = 3;

  if not found then
    raise exception 'reservation_resource_group_invalid' using errcode = '23514';
  end if;

  select booking_option.name
  into selected_option
  from public.booking_options as booking_option
  where booking_option.id = new.option_id
    and booking_option.business_id = new.business_id
    and booking_option.group_id = new.group_id;

  if not found then
    raise exception 'reservation_resource_option_invalid' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    if new.occupancy_mode is distinct from selected_group.occupancy_mode then
      raise exception 'reservation_resource_occupancy_mode_invalid' using errcode = '23514';
    end if;

    new.group_name_snapshot := selected_group.label;
    new.option_name_snapshot := selected_option.name;
  else
    if new.reservation_id is distinct from old.reservation_id
      or new.business_id is distinct from old.business_id
      or new.group_id is distinct from old.group_id
      or new.option_id is distinct from old.option_id
      or new.occupancy_mode is distinct from old.occupancy_mode
      or new.reservation_date is distinct from old.reservation_date
      or new.start_time is distinct from old.start_time
      or new.end_time is distinct from old.end_time
      or new.option_name_snapshot is distinct from old.option_name_snapshot
      or new.group_name_snapshot is distinct from old.group_name_snapshot
    then
      raise exception 'reservation_resource_identity_immutable' using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

create trigger reservation_resources_validate
before insert or update on public.reservation_resources
for each row execute function private.validate_reservation_resource();

create or replace function private.sync_reservation_resource_allocation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.resource_allocations (
      business_id,
      option_id,
      reservation_resource_id,
      occupancy_mode,
      allocation_date,
      start_time,
      end_time,
      active
    ) values (
      new.business_id,
      new.option_id,
      new.id,
      new.occupancy_mode,
      new.reservation_date,
      new.start_time,
      new.end_time,
      new.status <> 'cancelled'::public.appointment_status
    );
  elsif new.status is distinct from old.status then
    update public.resource_allocations
    set active = new.status <> 'cancelled'::public.appointment_status
    where reservation_resource_id = new.id
      and business_id = new.business_id;

    if not found then
      raise exception 'reservation_resource_allocation_missing' using errcode = '23503';
    end if;
  end if;

  return new;
end;
$$;

create trigger reservation_resources_sync_allocation
after insert or update of status on public.reservation_resources
for each row execute function private.sync_reservation_resource_allocation();

create or replace function private.create_reservation(
  p_business_id uuid,
  p_customer_name text,
  p_customer_whatsapp text,
  p_source public.appointment_source,
  p_created_by uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_reservation_id uuid;
begin
  insert into public.reservations (
    business_id,
    customer_name,
    customer_whatsapp,
    source,
    created_by
  ) values (
    p_business_id,
    trim(p_customer_name),
    trim(p_customer_whatsapp),
    p_source,
    p_created_by
  )
  returning id into new_reservation_id;

  return new_reservation_id;
end;
$$;

create or replace function private.create_reservation_resource(
  p_reservation_id uuid,
  p_business_id uuid,
  p_group_id uuid,
  p_option_id uuid,
  p_occupancy_mode public.booking_group_occupancy_mode,
  p_reservation_date date,
  p_start_time time default null,
  p_end_time time default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_resource_id uuid;
begin
  insert into public.reservation_resources (
    reservation_id,
    business_id,
    group_id,
    option_id,
    occupancy_mode,
    reservation_date,
    start_time,
    end_time,
    option_name_snapshot,
    group_name_snapshot
  ) values (
    p_reservation_id,
    p_business_id,
    p_group_id,
    p_option_id,
    p_occupancy_mode,
    p_reservation_date,
    p_start_time,
    p_end_time,
    'pending',
    'pending'
  )
  returning id into new_resource_id;

  return new_resource_id;
end;
$$;

create or replace function private.set_reservation_resource_status(
  p_resource_id uuid,
  p_status public.appointment_status
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.reservation_resources
  set status = p_status
  where id = p_resource_id;

  return found;
end;
$$;

revoke all on function private.validate_reservation_resource() from public, anon, authenticated;
revoke all on function private.sync_reservation_resource_allocation() from public, anon, authenticated;
revoke all on function private.create_reservation(uuid, text, text, public.appointment_source, uuid) from public, anon, authenticated;
revoke all on function private.create_reservation_resource(uuid, uuid, uuid, uuid, public.booking_group_occupancy_mode, date, time, time) from public, anon, authenticated;
revoke all on function private.set_reservation_resource_status(uuid, public.appointment_status) from public, anon, authenticated;

alter table public.reservations enable row level security;
alter table public.reservation_resources enable row level security;
alter table public.resource_allocations enable row level security;

revoke all on table public.reservations, public.reservation_resources, public.resource_allocations
from public, anon, authenticated;

grant select on table public.reservations, public.reservation_resources, public.resource_allocations
to authenticated;

create policy reservations_select_member_or_platform_admin
on public.reservations
for select
to authenticated
using (
  (select private.is_platform_admin())
  or (select private.is_business_member(business_id))
);

create policy reservation_resources_select_member_or_platform_admin
on public.reservation_resources
for select
to authenticated
using (
  (select private.is_platform_admin())
  or (select private.is_business_member(business_id))
);

create policy resource_allocations_select_member_or_platform_admin
on public.resource_allocations
for select
to authenticated
using (
  (select private.is_platform_admin())
  or (select private.is_business_member(business_id))
);

comment on table public.reservations is
  'Aggregate reservation intent. Component status remains authoritative; legacy appointments may have no reservation.';
comment on column public.appointments.reservation_id is
  'Optional aggregate link. Null preserves all legacy appointment behavior.';
comment on table public.reservation_resources is
  'Complementary reservation components with immutable catalog and occupancy snapshots.';
comment on table public.resource_allocations is
  'Single concurrency barrier for complementary resources; clients cannot mutate it directly.';
comment on column public.resource_allocations.occupied_period is
  'Local civil-time tsrange. day uses [date 00:00, next date 00:00); time_slot uses date plus its own times.';
comment on function private.create_reservation(uuid, text, text, public.appointment_source, uuid) is
  'Restricted primitive for future transactional reservation RPCs. It performs no authorization by itself.';
comment on function private.create_reservation_resource(uuid, uuid, uuid, uuid, public.booking_group_occupancy_mode, date, time, time) is
  'Restricted primitive that validates and inserts a complementary component; its trigger creates the allocation atomically.';
comment on function private.set_reservation_resource_status(uuid, public.appointment_status) is
  'Restricted primitive for future RPCs. Cancelling a component deactivates its allocation in the same transaction.';
