-- Public lead time is a business setting; administrative booking is unchanged.
alter table public.business_settings
  add column minimum_booking_notice_minutes integer not null default 60
  check (minimum_booking_notice_minutes >= 0);

-- No caller-controlled clock or GUC. Tests may replace this private function
-- inside a privileged transaction that is always rolled back.
create function private.booking_notice_now()
returns timestamptz language sql stable set search_path = '' as $$
  select pg_catalog.statement_timestamp();
$$;
revoke all on function private.booking_notice_now() from public, anon, authenticated;

create function private.public_booking_notice_is_valid(p_business_id uuid, p_date date, p_start time)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select
    ((p_date + p_start) at time zone 'America/Sao_Paulo') >=
      private.booking_notice_now() + make_interval(mins => settings.minimum_booking_notice_minutes)
    from public.business_settings settings where settings.business_id = p_business_id), false);
$$;
revoke all on function private.public_booking_notice_is_valid(uuid,date,time) from public, anon, authenticated;

-- Signature-preserving changes keep the deployed concurrency, cross-midnight,
-- notifications and response contracts. Fail closed if an expected guard moved.
do $migration$
declare definition text; revised text; signature text;
begin
  signature := 'private.get_primary_booking_availability(uuid,date,uuid,uuid,uuid,boolean,boolean)';
  definition := pg_get_functiondef(signature::regprocedure);
  revised := replace(definition, 'and private.primary_period_is_free(p_business_id,selected_group_1,',
    'and (not p_enforce_hours or private.public_booking_notice_is_valid(p_business_id,candidate::date,candidate::time))
      and private.primary_period_is_free(p_business_id,selected_group_1,');
  if revised = definition then raise exception 'notice_availability_guard_not_found'; end if;
  execute revised;

  signature := 'public.create_public_appointment(text,uuid,uuid,date,time,integer,text,text)';
  definition := pg_get_functiondef(signature::regprocedure);
  revised := replace(definition, 'if not private.public_primary_interval_is_valid(',
    'if not private.public_booking_notice_is_valid(selected_business.id,p_date,p_start_time) then
      raise exception ''booking_minimum_notice'' using errcode=''22023'';
    end if;
    if not private.public_primary_interval_is_valid(');
  if revised = definition then raise exception 'notice_creation_guard_not_found'; end if;
  execute revised;

  -- This predicate is used only by PUBLIC complementary availability/creation.
  -- Its day branch remains untouched, including same-day daily reservations.
  signature := 'private.complementary_public_window_is_valid(uuid,public.booking_group_occupancy_mode,date,time,time)';
  definition := pg_get_functiondef(signature::regprocedure);
  revised := replace(definition, 'else p_start_time is not null',
    'else private.public_booking_notice_is_valid(p_business_id,p_date,p_start_time) and p_start_time is not null');
  if revised = definition then raise exception 'notice_complementary_guard_not_found'; end if;
  execute revised;
end;
$migration$;

comment on column public.business_settings.minimum_booking_notice_minutes is
  'Public temporal booking lead time in minutes. Default 60, zero preserves legacy rules. Admin and complementary day are exempt.';

-- The exclusive complementary flow previously proposed local, unchecked slots.
-- Reuse its existing interval authority; return only slots with a free option.
create function public.get_public_complementary_time_slots(p_slug text, p_date date)
returns jsonb language sql stable security definer set search_path = '' as $$
  with candidates as (
    select distinct candidate, settings.fixed_duration_minutes duration
    from public.businesses business
    join public.business_settings settings on settings.business_id = business.id
    cross join (values (p_date - 1), (p_date)) dates(day)
    join public.business_hours hours on hours.business_id = business.id
      and hours.weekday = extract(dow from day) and hours.active
    cross join lateral generate_series(day + hours.start_time,
      upper(private.booking_period(day,hours.start_time,hours.end_time))
        - make_interval(mins => settings.fixed_duration_minutes),
      make_interval(mins => settings.fixed_duration_minutes)) generated(candidate)
    where business.slug = lower(trim(p_slug)) and business.active
      and exists (select 1 from public.booking_groups where business_id=business.id
        and position=3 and active and occupancy_mode='time_slot')
      and candidate >= p_date::timestamp and candidate < (p_date+1)::timestamp
      and private.public_booking_notice_is_valid(business.id,candidate::date,candidate::time)
  )
  select coalesce(jsonb_agg(jsonb_build_object('start_time',to_char(candidate,'HH24:MI'),
    'duration_minutes',duration,'max_blocks',1) order by candidate),'[]'::jsonb)
  from candidates where exists (
    select 1 from jsonb_array_elements(public.get_public_complementary_availability(
      p_slug,p_date,candidate::time,(candidate+make_interval(mins=>duration))::time)->'options') option
    where (option->>'available')::boolean
  );
$$;
revoke all on function public.get_public_complementary_time_slots(text,date) from public;
grant execute on function public.get_public_complementary_time_slots(text,date) to anon, authenticated;
