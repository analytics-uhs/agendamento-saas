-- Civil dates always identify the actual start date. An earlier end belongs
-- to the next date; 24:00 remains the legacy canonical end-of-day value.
create or replace function private.booking_period(p_date date, p_start time, p_end time)
returns tsrange language sql immutable strict set search_path = '' as $$
  select tsrange(p_date + p_start,
    p_date + p_end + case when p_end < p_start then interval '1 day' else interval '0' end, '[)');
$$;

-- A cyclic week, including Saturday -> Sunday. Adjacent windows do not overlap.
create or replace function private.weekly_booking_period(p_weekday integer, p_start time, p_end time)
returns int4multirange language sql immutable strict set search_path = '' as $$
  with bounds as (
    select p_weekday * 86400 + extract(epoch from p_start)::integer lo,
      p_weekday * 86400 + extract(epoch from p_end)::integer
        + case when p_end < p_start then 86400 else 0 end hi
  )
  select case when hi > 604800 then
    int4multirange(int4range(lo, 604800, '[)'), int4range(0, hi - 604800, '[)'))
    else int4multirange(int4range(lo, hi, '[)')) end from bounds;
$$;

revoke all on function private.booking_period(date,time,time) from public, anon, authenticated;
revoke all on function private.weekly_booking_period(integer,time,time) from public, anon, authenticated;

alter table public.business_hours
  drop constraint business_hours_valid_range,
  drop constraint business_hours_no_overlapping_windows,
  add constraint business_hours_valid_range check (start_time <> end_time and start_time < time '24:00'),
  add constraint business_hours_no_overlapping_windows exclude using gist (
    business_id with =, (private.weekly_booking_period(weekday,start_time,end_time)) with &&
  );
alter table public.booking_option_hours
  drop constraint booking_option_hours_valid_window,
  drop constraint booking_option_hours_no_overlap,
  add constraint booking_option_hours_valid_window check (start_time <> end_time and start_time < time '24:00'),
  add constraint booking_option_hours_no_overlap exclude using gist (
    business_id with =, option_id with =,
    (private.weekly_booking_period(weekday,start_time,end_time)) with &&
  ) where (active);

alter table public.appointments
  drop constraint appointments_valid_time_range,
  drop constraint appointments_no_overlapping_active_bookings,
  add constraint appointments_valid_time_range check (start_time <> end_time and start_time < time '24:00'),
  add constraint appointments_no_overlapping_active_bookings exclude using gist (
    business_id with =, (coalesce(group_1_option_id,business_id)) with =,
    (private.booking_period(appointment_date,start_time,end_time)) with &&
  ) where (status <> 'cancelled');

alter table public.calendar_blocks
  drop constraint calendar_blocks_time_order,
  add constraint calendar_blocks_time_order check (start_time <> end_time and start_time < time '24:00'),
  alter column block_period set expression as (private.booking_period(block_date,start_time,end_time));
alter table public.calendar_block_series
  drop constraint calendar_block_series_time_order,
  add constraint calendar_block_series_time_order check (start_time <> end_time and start_time < time '24:00');

-- day stays exactly one civil day and never gains fictional UI hours.
create or replace function private.complementary_period(
  p_occupancy_mode public.booking_group_occupancy_mode, p_date date,
  p_start_time time default null, p_end_time time default null
) returns tsrange language sql immutable set search_path = '' as $$
  select case when p_occupancy_mode = 'day' then tsrange(p_date::timestamp,(p_date+1)::timestamp,'[)')
    else private.booking_period(p_date,p_start_time,private.normalize_end_of_day_time(p_start_time,p_end_time)) end;
$$;

alter table public.resource_allocations alter column occupied_period set expression as (
  private.complementary_period(occupancy_mode,allocation_date,start_time,end_time)
);

do $$
declare table_name text;
begin
  foreach table_name in array array['reservation_resources','resource_allocations','resource_blocks','resource_block_series'] loop
    execute format('alter table public.%I drop constraint %I, add constraint %I check (
      (occupancy_mode = ''day'' and start_time is null and end_time is null)
      or (occupancy_mode = ''time_slot'' and start_time is not null and end_time is not null
        and start_time <> end_time and start_time < time ''24:00''))',
      table_name,table_name||'_occupancy_shape_check',table_name||'_occupancy_shape_check');
  end loop;
end;
$$;

-- Resolve precedence once using the existing business/custom resolver. Include
-- yesterday only to retain the opening anchor of a effective_window spilling into today.
create or replace function private.effective_primary_periods(p_business_id uuid,p_option_id uuid,p_date date)
returns table(period tsrange) language sql stable security definer set search_path = '' as $$
  select private.booking_period(day,effective_window.start_time,effective_window.end_time)
  from (values(p_date-1),(p_date)) dates(day)
  cross join lateral private.get_effective_primary_option_hours(p_business_id,p_option_id,day) effective_window
  where private.booking_period(day,effective_window.start_time,effective_window.end_time)
    && tsrange(p_date::timestamp,(p_date+1)::timestamp,'[)');
$$;
revoke all on function private.effective_primary_periods(uuid,uuid,date) from public,anon,authenticated;

create or replace function private.public_primary_interval_is_valid(
  p_business_id uuid,p_group_1_option_id uuid,p_date date,p_start_time time,p_duration_minutes integer,p_base_duration integer
) returns boolean language sql stable security definer set search_path = '' as $$
  select p_duration_minutes > 0 and p_duration_minutes < 1440 and p_base_duration > 0
    and p_start_time < time '24:00' and exists (
      select 1 from private.effective_primary_periods(p_business_id,p_group_1_option_id,p_date) effective_window
      where tsrange(p_date+p_start_time,p_date+p_start_time+make_interval(mins=>p_duration_minutes),'[)') <@ effective_window.period
        and mod(extract(epoch from ((p_date+p_start_time)-lower(effective_window.period)))::numeric,p_base_duration*60)=0
    );
$$;

create or replace function private.complementary_public_window_is_valid(
  p_business_id uuid,p_occupancy_mode public.booking_group_occupancy_mode,p_date date,p_start_time time default null,p_end_time time default null
) returns boolean language sql stable security definer set search_path = '' as $$
  select case when p_occupancy_mode='day' then exists (
    select 1 from public.business_hours where business_id=p_business_id and weekday=extract(dow from p_date) and active
  ) else p_start_time is not null and p_end_time is not null and p_start_time<>p_end_time
    and p_start_time<time '24:00' and exists (
      select 1 from (values(p_date-1),(p_date)) dates(day)
      join public.business_hours hour on hour.business_id=p_business_id and hour.weekday=extract(dow from day) and hour.active
      where private.booking_period(p_date,p_start_time,private.normalize_end_of_day_time(p_start_time,p_end_time))
        <@ private.booking_period(day,hour.start_time,hour.end_time)
    ) end;
$$;

-- One shared date-independent overlap predicate for public/admin/recurrence.
create or replace function private.primary_period_is_free(
  p_business_id uuid,p_option_id uuid,p_period tsrange,p_exclude_appointment_id uuid default null,
  p_include_blocks boolean default true,p_exclude_block_id uuid default null
) returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1 from public.appointments appointment where appointment.business_id=p_business_id
      and coalesce(appointment.group_1_option_id,appointment.business_id)=coalesce(p_option_id,p_business_id)
      and appointment.status<>'cancelled' and appointment.id is distinct from p_exclude_appointment_id
      and private.booking_period(appointment.appointment_date,appointment.start_time,appointment.end_time) && p_period
  ) and (not p_include_blocks or not exists (
    select 1 from public.calendar_blocks block where block.business_id=p_business_id
      and block.resource_id=coalesce(p_option_id,p_business_id) and block.cancelled_at is null
      and block.id is distinct from p_exclude_block_id and block.block_period && p_period
  ));
$$;
revoke all on function private.primary_period_is_free(uuid,uuid,tsrange,uuid,boolean,uuid) from public,anon,authenticated;

create or replace function private.calendar_interval_is_available(
  p_business_id uuid,p_group_1_option_id uuid,p_date date,p_start_time time,p_end_time time,p_exclude_block_id uuid default null
) returns boolean language sql stable security definer set search_path = '' as $$
  select p_start_time<>p_end_time and p_start_time<time '24:00'
    and exists(select 1 from private.effective_primary_periods(p_business_id,p_group_1_option_id,p_date) effective_window
      where private.booking_period(p_date,p_start_time,private.normalize_end_of_day_time(p_start_time,p_end_time)) <@ effective_window.period)
    and private.primary_period_is_free(p_business_id,p_group_1_option_id,
      private.booking_period(p_date,p_start_time,private.normalize_end_of_day_time(p_start_time,p_end_time)),null,true,p_exclude_block_id);
$$;

-- A shared resource lock protects the cross-table invariant, including writes
-- starting on different dates. GiST still independently protects each table.
create or replace function private.prevent_appointment_calendar_block_conflict()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('primary-period:'||new.business_id::text||':'||coalesce(new.group_1_option_id,new.business_id)::text,0));
  if new.status<>'cancelled' and exists (
    select 1 from public.calendar_blocks block where block.business_id=new.business_id and block.cancelled_at is null
      and block.resource_id=coalesce(new.group_1_option_id,new.business_id)
      and block.block_period && private.booking_period(new.appointment_date,new.start_time,new.end_time)
  ) then raise exception 'booking_conflict' using errcode='23P01'; end if;
  return new;
end;
$$;

create or replace function private.prevent_calendar_block_appointment_conflict()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('primary-period:'||new.business_id::text||':'||coalesce(new.group_1_option_id,new.business_id)::text,0));
  if new.cancelled_at is null and not private.primary_period_is_free(new.business_id,new.group_1_option_id,
    private.booking_period(new.block_date,new.start_time,new.end_time),null,false) then
    raise exception 'calendar_block_conflict' using errcode='23P01';
  end if;
  return new;
end;
$$;
create trigger calendar_blocks_reject_appointment_conflict before insert or update on public.calendar_blocks
for each row execute function private.prevent_calendar_block_appointment_conflict();
revoke all on function private.prevent_calendar_block_appointment_conflict() from public,anon,authenticated;


create or replace function private.validate_business_hours_payload(p_hours jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(jsonb_typeof(p_hours), '') <> 'array'
    or jsonb_array_length(p_hours) <> 7
    or (
      select count(distinct (day ->> 'weekday')::integer)
      from jsonb_array_elements(p_hours) as selected(day)
    ) <> 7
    or exists (
      select 1
      from jsonb_array_elements(p_hours) as selected(day)
      where (day ->> 'weekday')::integer not between 0 and 6
        or coalesce(jsonb_typeof(day -> 'windows'), '') <> 'array'
    ) then
    raise exception 'business_hours_invalid_days' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_hours) selected(day)
    cross join lateral jsonb_array_elements(day->'windows') selected_window(payload)
    where nullif(payload->>'start_time','') is null or nullif(payload->>'end_time','') is null
      or (payload->>'start_time')::time=(payload->>'end_time')::time
      or (payload->>'start_time')::time>=time '24:00'
  ) then raise exception 'business_hours_invalid_window' using errcode='22023'; end if;
  if exists (
    with windows as (
      select row_number() over() id,private.weekly_booking_period((day->>'weekday')::integer,
        (payload->>'start_time')::time,private.normalize_end_of_day_time((payload->>'start_time')::time,(payload->>'end_time')::time)) period
      from jsonb_array_elements(p_hours) selected(day)
      cross join lateral jsonb_array_elements(day->'windows') selected_window(payload)
    ) select 1 from windows a join windows b on a.id<b.id and a.period && b.period
  ) then raise exception 'business_hours_overlap' using errcode='23P01'; end if;
end;
$$;

create or replace function private.get_primary_booking_availability(
  p_business_id uuid,
  p_date date,
  p_group_1_option_id uuid,
  p_group_2_option_id uuid,
  p_exclude_appointment_id uuid default null,
  p_enforce_hours boolean default true,
  p_include_blocks boolean default true
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  selected_business record;
  selected_group_1 uuid;
  selected_group_2 uuid;
  group_1_active boolean;
  group_2_active boolean;
  base_duration integer;
  excluded_start time;
  custom_schedule boolean := false;
  local_now timestamp := pg_catalog.now() at time zone 'America/Sao_Paulo';
  result jsonb;
begin
  select business.id, settings.duration_mode, settings.fixed_duration_minutes
  into selected_business
  from public.businesses business
  join public.business_settings settings on settings.business_id = business.id
  where business.id = p_business_id and business.active;
  if not found or p_date is null then return '[]'::jsonb; end if;

  if p_exclude_appointment_id is not null then
    select appointment.start_time into excluded_start
    from public.appointments appointment
    where appointment.id = p_exclude_appointment_id
      and appointment.business_id = p_business_id
      and appointment.appointment_date = p_date;
  end if;
  if p_date < local_now::date and excluded_start is null then return '[]'::jsonb; end if;

  select exists (select 1 from public.booking_groups where business_id=p_business_id and position=1 and active)
    into group_1_active;
  select exists (select 1 from public.booking_groups where business_id=p_business_id and position=2 and active)
    into group_2_active;

  if group_1_active then
    select booking_option.id into selected_group_1
    from public.booking_options booking_option
    join public.booking_groups booking_group on booking_group.id=booking_option.group_id
    where booking_option.id=p_group_1_option_id and booking_option.business_id=p_business_id
      and booking_option.active and booking_group.active and booking_group.position=1;
    if not found then raise exception 'booking_invalid_group_1' using errcode='22023'; end if;
  elsif p_group_1_option_id is not null then
    raise exception 'booking_invalid_group_1' using errcode='22023';
  end if;

  if group_2_active then
    select booking_option.id into selected_group_2
    from public.booking_options booking_option
    join public.booking_groups booking_group on booking_group.id=booking_option.group_id
    where booking_option.id=p_group_2_option_id and booking_option.business_id=p_business_id
      and booking_option.active and booking_group.active and booking_group.position=2;
    if not found then raise exception 'booking_invalid_group_2' using errcode='22023'; end if;
  elsif p_group_2_option_id is not null then
    raise exception 'booking_invalid_group_2' using errcode='22023';
  end if;

  if selected_business.duration_mode='group_2' then
    if selected_group_2 is null then raise exception 'booking_group_2_duration_required' using errcode='22023'; end if;
    select duration_minutes into base_duration from public.booking_options where id=selected_group_2;
  else
    base_duration := selected_business.fixed_duration_minutes;
  end if;
  if base_duration is null or base_duration <= 0 then raise exception 'booking_invalid_duration' using errcode='22023'; end if;

  select exists (
    select 1 from public.booking_options
    where id = selected_group_1 and business_id = p_business_id
      and schedule_mode = 'custom'
  ) into custom_schedule;

  with effective_windows as (
    select period from private.effective_primary_periods(p_business_id,selected_group_1,p_date)
  ), anchors as (
    select lower(period) anchor, upper(period) window_end from effective_windows where p_enforce_hours
    union
    select p_date::timestamp, (p_date+2)::timestamp where not p_enforce_hours
      and (not custom_schedule or not exists(select 1 from effective_windows))
    union
    select p_date + make_interval(secs=>mod(
      mod(extract(epoch from (lower(period)-p_date::timestamp)),base_duration*60)+base_duration*60,
      base_duration*60)::double precision), (p_date+2)::timestamp
    from effective_windows where not p_enforce_hours and custom_schedule
    union
    select lower(period), (p_date+2)::timestamp from effective_windows where not p_enforce_hours and not custom_schedule
  ), candidates as (
    select candidate,window_end from anchors cross join lateral generate_series(
      anchor,least(window_end-make_interval(mins=>base_duration),(p_date+1)::timestamp-interval '1 microsecond'),
      make_interval(mins=>base_duration)
    ) generated(candidate) where candidate>=p_date::timestamp and candidate<(p_date+1)::timestamp
      and (p_date>local_now::date or candidate>local_now or candidate::time=excluded_start)
    union
    select p_date+excluded_start,(p_date+2)::timestamp where not p_enforce_hours and excluded_start is not null
  ), available as (
    select candidate, max(block_count) max_blocks from candidates
    cross join lateral generate_series(1,case when selected_business.duration_mode='fixed_multiple'
      then least(floor(extract(epoch from (window_end-candidate))/60/base_duration)::integer,
        (1439/base_duration)) else 1 end) blocks(block_count)
    where candidate+make_interval(mins=>base_duration*block_count)<=window_end
      and private.primary_period_is_free(p_business_id,selected_group_1,
        tsrange(candidate,candidate+make_interval(mins=>base_duration*block_count),'[)'),
        p_exclude_appointment_id,p_include_blocks)
    group by candidate
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'start_time',to_char(candidate,'HH24:MI'),'duration_minutes',base_duration,'max_blocks',max_blocks
  ) order by candidate),'[]'::jsonb) into result from available where max_blocks>0;
  return result;
end;
$$;

-- Restrict the signature-preserving update to the six known interval guards.
-- Read deployed definitions so earlier additive response/security fixes survive.
do $migration$
declare signature text; definition text; revised text;
begin
  foreach signature in array array[
    'public.create_calendar_blocks(uuid[],date,time,time,text,boolean,integer)',
    'public.get_public_complementary_availability(text,date,time,time)',
    'public.create_public_reservation(text,jsonb)',
    'public.get_admin_complementary_availability(date,time,time)',
    'public.create_admin_reservation(jsonb)',
    'public.create_admin_resource_blocks(uuid[],date,time,time,text,boolean,integer)'
  ] loop
    definition:=pg_get_functiondef(signature::regprocedure);
    revised:=regexp_replace(definition,
      '(p_start_time|complementary_start_time|complementary_start)([[:space:]]*)>=([[:space:]]*)(private.normalize_end_of_day_time|normalized_end_time)',
      '\1\2=\3\4','g');
    if revised=definition then raise exception 'cross_midnight_guard_not_found: %',signature; end if;
    execute revised;
  end loop;
end;
$migration$;

create or replace function public.get_public_booking_page(p_slug text)
returns jsonb language sql stable security definer set search_path=''
as $$
  select jsonb_build_object(
    'business',jsonb_build_object('id',business.id,'name',business.name,'slug',business.slug,'whatsapp',business.whatsapp,'logo_url',business.logo_url,
      'address',business.address,'google_maps_url',business.google_maps_url,'instagram_url',business.instagram_url,'facebook_url',business.facebook_url),
    'groups',coalesce((select jsonb_agg(
      jsonb_build_object('position',booking_group.position,'label',booking_group.label,'required',booking_group.required,
        'options',coalesce((select jsonb_agg(
          jsonb_build_object('id',booking_option.id,'name',booking_option.name,'duration_minutes',booking_option.duration_minutes)
          || case when booking_group.position=1 and booking_option.schedule_mode='custom' then jsonb_build_object(
            'available_weekdays',coalesce((select jsonb_agg(distinct visible.weekday order by visible.weekday)
              from public.booking_option_hours option_hour cross join lateral unnest(case when option_hour.end_time<option_hour.start_time then array[option_hour.weekday::integer,(option_hour.weekday+1)%7] else array[option_hour.weekday::integer] end) visible(weekday) where option_hour.option_id=booking_option.id and option_hour.business_id=business.id and option_hour.active),'[]'::jsonb)
          ) else '{}'::jsonb end order by booking_option.sort_order,booking_option.name)
          from public.booking_options booking_option where booking_option.business_id=business.id and booking_option.group_id=booking_group.id and booking_option.active),'[]'::jsonb))
      || case when booking_group.position=3 then jsonb_build_object('intent_name',booking_group.intent_name,'occupancy_mode',booking_group.occupancy_mode) else '{}'::jsonb end
      order by booking_group.sort_order,booking_group.position)
      from public.booking_groups booking_group where booking_group.business_id=business.id and booking_group.active),'[]'::jsonb),
    'hours',coalesce((select jsonb_agg(jsonb_build_object('weekday',business_hour.weekday,'start_time',business_hour.start_time,'end_time',business_hour.end_time) order by business_hour.weekday)
      from public.business_hours business_hour where business_hour.business_id=business.id and business_hour.active),'[]'::jsonb),
    'settings',jsonb_build_object('duration_mode',settings.duration_mode,'fixed_duration_minutes',settings.fixed_duration_minutes,
      'allow_multiple_blocks',settings.allow_multiple_blocks,'palette',settings.palette,'theme_preference',settings.theme_preference))
  from public.businesses business join public.business_settings settings on settings.business_id=business.id
  where business.slug=lower(trim(p_slug)) and business.active limit 1;
$$;
