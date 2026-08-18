create table public.appointment_series (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  group_1_option_id uuid,
  group_2_option_id uuid,
  customer_name text not null check (char_length(trim(customer_name)) between 2 and 120),
  customer_whatsapp text not null check (char_length(customer_whatsapp) between 10 and 15),
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  duration_minutes integer not null check (duration_minutes > 0),
  blocks integer not null check (blocks > 0),
  starts_on date not null,
  repeat_count integer check (repeat_count is null or repeat_count >= 2),
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointment_series_id_business_unique unique (id, business_id),
  constraint appointment_series_weekday_matches_start check (
    weekday = extract(dow from starts_on)::smallint
  ),
  constraint appointment_series_group_1_tenant_fk
    foreign key (group_1_option_id, business_id)
    references public.booking_options (id, business_id),
  constraint appointment_series_group_2_tenant_fk
    foreign key (group_2_option_id, business_id)
    references public.booking_options (id, business_id)
);

create index appointment_series_business_active_idx
  on public.appointment_series (business_id, active);
create index appointment_series_materialization_idx
  on public.appointment_series (active, starts_on, weekday)
  where active;

alter table public.appointments
add column series_id uuid,
add constraint appointments_series_tenant_fk
  foreign key (series_id, business_id)
  references public.appointment_series (id, business_id)
  on delete restrict;

create unique index appointments_series_date_unique
  on public.appointments (series_id, appointment_date)
  where series_id is not null;

create index appointments_series_scheduled_idx
  on public.appointments (series_id, appointment_date, start_time)
  where series_id is not null and status = 'scheduled'::public.appointment_status;

create trigger appointment_series_set_updated_at
before update on public.appointment_series
for each row execute function private.set_updated_at();

create or replace function private.validate_appointment_series_options()
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
    raise exception 'series_group_1_invalid' using errcode = '22023';
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
    raise exception 'series_group_2_invalid' using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger appointment_series_validate_options
before insert or update of business_id, group_1_option_id, group_2_option_id
on public.appointment_series
for each row execute function private.validate_appointment_series_options();

create or replace function private.preserve_appointment_series_ownership()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.business_id <> old.business_id then
    raise exception 'series business_id cannot be changed';
  end if;

  if new.created_by is distinct from old.created_by then
    raise exception 'series created_by cannot be changed';
  end if;

  return new;
end;
$$;

create trigger appointment_series_preserve_ownership
before update of business_id, created_by on public.appointment_series
for each row execute function private.preserve_appointment_series_ownership();

create or replace function private.set_appointment_series()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  requested_series_id uuid;
  selected_series public.appointment_series%rowtype;
begin
  requested_series_id := nullif(
    pg_catalog.current_setting('app.appointment_series_id', true),
    ''
  )::uuid;

  if requested_series_id is null then
    if new.series_id is not null then
      raise exception 'appointment_series_context_required' using errcode = '42501';
    end if;
    return new;
  end if;

  select series.*
  into selected_series
  from public.appointment_series as series
  where series.id = requested_series_id
    and series.active
  for update;

  if not found
    or (select auth.uid()) is null
    or not (select private.has_business_role(
      selected_series.business_id,
      array['owner', 'admin']::public.business_role[]
    )) then
    raise exception 'appointment_series_forbidden' using errcode = '42501';
  end if;

  if new.business_id <> selected_series.business_id
    or new.group_1_option_id is distinct from selected_series.group_1_option_id
    or new.group_2_option_id is distinct from selected_series.group_2_option_id
    or new.customer_name <> selected_series.customer_name
    or new.customer_whatsapp <> selected_series.customer_whatsapp
    or new.start_time <> selected_series.start_time
    or new.duration_minutes <> selected_series.duration_minutes
    or new.appointment_date < selected_series.starts_on
    or extract(dow from new.appointment_date)::smallint <> selected_series.weekday then
    raise exception 'appointment_series_mismatch' using errcode = '22023';
  end if;

  new.series_id := selected_series.id;
  return new;
end;
$$;

create trigger appointments_set_series
before insert on public.appointments
for each row execute function private.set_appointment_series();

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

  if new.source is distinct from old.source then
    raise exception 'appointment source cannot be changed';
  end if;

  if new.series_id is distinct from old.series_id then
    raise exception 'appointment series_id cannot be changed';
  end if;

  return new;
end;
$$;

drop trigger appointments_preserve_ownership on public.appointments;
create trigger appointments_preserve_ownership
before update of business_id, created_by, source, series_id on public.appointments
for each row execute function private.preserve_appointment_ownership();

alter table public.appointment_series enable row level security;

revoke all on table public.appointment_series from anon, authenticated;
grant select on table public.appointment_series to authenticated;

create policy appointment_series_select_member_or_platform_admin
on public.appointment_series
for select
to authenticated
using (
  (select private.is_platform_admin())
  or (select private.is_business_member(business_id))
);

comment on table public.appointment_series is
  'Administrative weekly recurrence definitions. One weekday per series; null repeat_count means permanent.';
comment on column public.appointment_series.repeat_count is
  'Total number of weekly occurrences. Null means a permanent series materialized through a rolling horizon.';
comment on column public.appointments.series_id is
  'Null for one-off appointments; references the weekly administrative series for recurring occurrences.';
comment on function private.set_appointment_series() is
  'Associates engine-created appointments with an authorized series through transaction-local context and validates immutable series data.';
