-- Administrative appointments may operate outside public business hours.
-- Public availability and create_public_appointment remain unchanged.

create or replace function private.get_admin_booking_availability(
  p_business_id uuid,
  p_date date,
  p_group_1_option_id uuid,
  p_group_2_option_id uuid,
  p_exclude_appointment_id uuid default null
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
  local_now timestamp := pg_catalog.now() at time zone 'America/Sao_Paulo';
  result jsonb;
begin
  select business.id, settings.duration_mode, settings.fixed_duration_minutes,
    settings.allow_multiple_blocks
  into selected_business
  from public.businesses business
  join public.business_settings settings on settings.business_id = business.id
  where business.id = p_business_id and business.active;
  if not found or p_date is null then return '[]'::jsonb; end if;

  if p_exclude_appointment_id is not null then
    select appointment.start_time into excluded_start
    from public.appointments appointment
    where appointment.id = p_exclude_appointment_id
      and appointment.business_id = selected_business.id
      and appointment.appointment_date = p_date;
  end if;
  if p_date < local_now::date and excluded_start is null then return '[]'::jsonb; end if;

  select exists (select 1 from public.booking_groups where business_id = selected_business.id and position = 1 and active) into group_1_active;
  select exists (select 1 from public.booking_groups where business_id = selected_business.id and position = 2 and active) into group_2_active;

  if group_1_active then
    select option.id into selected_group_1
    from public.booking_options option
    join public.booking_groups booking_group on booking_group.id = option.group_id
    where option.id = p_group_1_option_id and option.business_id = selected_business.id
      and option.active and booking_group.active and booking_group.position = 1;
    if not found then raise exception 'booking_invalid_group_1' using errcode = '22023'; end if;
  elsif p_group_1_option_id is not null then
    raise exception 'booking_invalid_group_1' using errcode = '22023';
  end if;

  if group_2_active then
    select option.id into selected_group_2
    from public.booking_options option
    join public.booking_groups booking_group on booking_group.id = option.group_id
    where option.id = p_group_2_option_id and option.business_id = selected_business.id
      and option.active and booking_group.active and booking_group.position = 2;
    if not found then raise exception 'booking_invalid_group_2' using errcode = '22023'; end if;
  elsif p_group_2_option_id is not null then
    raise exception 'booking_invalid_group_2' using errcode = '22023';
  end if;

  if selected_business.duration_mode = 'group_2' then
    if selected_group_2 is null then raise exception 'booking_group_2_duration_required' using errcode = '22023'; end if;
    select duration_minutes into base_duration from public.booking_options where id = selected_group_2;
  else
    base_duration := selected_business.fixed_duration_minutes;
  end if;
  if base_duration is null or base_duration <= 0 then raise exception 'booking_invalid_duration' using errcode = '22023'; end if;

  with anchors as (
    select p_date::timestamp as anchor
    union
    select p_date + hour.start_time
    from public.business_hours hour
    where hour.business_id = selected_business.id
      and hour.weekday = extract(dow from p_date)::integer and hour.active
  ), candidates as (
    select distinct generated.candidate
    from anchors
    cross join lateral pg_catalog.generate_series(
      anchor,
      p_date + interval '1 day' - pg_catalog.make_interval(mins => base_duration),
      pg_catalog.make_interval(mins => base_duration)
    ) generated(candidate)
    where p_date > local_now::date or generated.candidate > local_now
      or (excluded_start is not null and generated.candidate::time = excluded_start)
  ), available as (
    select candidate,
      case when selected_business.duration_mode = 'fixed_multiple' then (
        select max(block_count)
        from pg_catalog.generate_series(
          1,
          floor(extract(epoch from ((p_date + interval '1 day') - candidate)) / 60 / base_duration)::integer
        ) blocks(block_count)
        where not exists (
          select 1 from public.appointments appointment
          where appointment.business_id = selected_business.id
            and appointment.appointment_date = p_date
            and appointment.status <> 'cancelled'::public.appointment_status
            and (p_exclude_appointment_id is null or appointment.id <> p_exclude_appointment_id)
            and coalesce(appointment.group_1_option_id, appointment.business_id) = coalesce(selected_group_1, selected_business.id)
            and appointment.start_time < (candidate + pg_catalog.make_interval(mins => base_duration * block_count))::time
            and appointment.end_time > candidate::time
        ) and not exists (
          select 1 from public.calendar_blocks block
          where block.business_id = selected_business.id and block.block_date = p_date
            and block.cancelled_at is null
            and block.resource_id = coalesce(selected_group_1, selected_business.id)
            and block.start_time < (candidate + pg_catalog.make_interval(mins => base_duration * block_count))::time
            and block.end_time > candidate::time
        )
      ) else case when not exists (
        select 1 from public.appointments appointment
        where appointment.business_id = selected_business.id
          and appointment.appointment_date = p_date
          and appointment.status <> 'cancelled'::public.appointment_status
          and (p_exclude_appointment_id is null or appointment.id <> p_exclude_appointment_id)
          and coalesce(appointment.group_1_option_id, appointment.business_id) = coalesce(selected_group_1, selected_business.id)
          and appointment.start_time < (candidate + pg_catalog.make_interval(mins => base_duration))::time
          and appointment.end_time > candidate::time
      ) and not exists (
        select 1 from public.calendar_blocks block
        where block.business_id = selected_business.id and block.block_date = p_date
          and block.cancelled_at is null
          and block.resource_id = coalesce(selected_group_1, selected_business.id)
          and block.start_time < (candidate + pg_catalog.make_interval(mins => base_duration))::time
          and block.end_time > candidate::time
      ) then 1 else 0 end end as max_blocks
    from candidates
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'start_time', to_char(candidate, 'HH24:MI'),
    'duration_minutes', base_duration,
    'max_blocks', max_blocks
  ) order by candidate), '[]'::jsonb) into result
  from available where max_blocks > 0;
  return result;
end;
$$;

revoke all on function private.get_admin_booking_availability(uuid, date, uuid, uuid, uuid) from public;

create or replace function public.get_admin_booking_availability(
  p_date date, p_group_1_option_id uuid, p_group_2_option_id uuid
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare current_user_id uuid := auth.uid(); selected_business_id uuid;
begin
  if current_user_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  select membership.business_id into selected_business_id
  from public.business_members membership
  join public.businesses business on business.id = membership.business_id
  where membership.user_id = current_user_id and membership.role in ('owner','admin') and business.active
  order by membership.created_at, membership.id limit 1;
  if selected_business_id is null then raise exception 'admin_appointment_forbidden' using errcode = '42501'; end if;
  return private.get_admin_booking_availability(selected_business_id, p_date, p_group_1_option_id, p_group_2_option_id, null);
end;
$$;

create or replace function public.get_admin_appointment_edit_availability(
  p_appointment_id uuid, p_date date, p_group_1_option_id uuid, p_group_2_option_id uuid
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare current_user_id uuid := auth.uid(); selected record;
begin
  if current_user_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  select appointment.id, appointment.status, appointment.business_id into selected
  from public.appointments appointment
  join public.business_members membership on membership.business_id = appointment.business_id
    and membership.user_id = current_user_id and membership.role in ('owner','admin')
  where appointment.id = p_appointment_id;
  if not found then raise exception 'appointment_not_found' using errcode = '42501'; end if;
  if selected.status <> 'scheduled'::public.appointment_status then raise exception 'appointment_invalid_status_transition' using errcode = '22023'; end if;
  return private.get_admin_booking_availability(selected.business_id, p_date, p_group_1_option_id, p_group_2_option_id, selected.id);
end;
$$;

create or replace function public.create_admin_appointment(
  p_group_1_option_id uuid, p_group_2_option_id uuid, p_date date,
  p_start_time time, p_blocks integer, p_customer_name text, p_customer_whatsapp text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid(); selected_business record; available jsonb;
  selected_slot jsonb; total_duration integer;
  normalized_whatsapp text := pg_catalog.regexp_replace(coalesce(p_customer_whatsapp,''), '\D','','g');
  new_appointment_id uuid;
begin
  if current_user_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_blocks is null or p_blocks < 1 or char_length(trim(coalesce(p_customer_name,''))) not between 2 and 120
    then raise exception 'booking_invalid_input' using errcode = '22023'; end if;
  if char_length(normalized_whatsapp) not between 10 and 15 then raise exception 'booking_invalid_whatsapp' using errcode = '22023'; end if;
  select business.id into selected_business
  from public.business_members membership join public.businesses business on business.id = membership.business_id
  where membership.user_id = current_user_id and membership.role in ('owner','admin') and business.active
  order by membership.created_at, membership.id limit 1;
  if not found then raise exception 'admin_appointment_forbidden' using errcode = '42501'; end if;
  available := private.get_admin_booking_availability(selected_business.id, p_date, p_group_1_option_id, p_group_2_option_id, null);
  select item into selected_slot from jsonb_array_elements(available) item
  where left(item->>'start_time',5) = left(p_start_time::text,5) limit 1;
  if selected_slot is null or p_blocks > (selected_slot->>'max_blocks')::integer then raise exception 'booking_conflict' using errcode = '23P01'; end if;
  total_duration := (selected_slot->>'duration_minutes')::integer * p_blocks;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(selected_business.id::text || ':' || p_date::text, 0));
  perform pg_catalog.set_config('app.appointment_source','admin',true);
  insert into public.appointments (business_id, group_1_option_id, group_2_option_id,
    customer_name, customer_whatsapp, appointment_date, start_time, end_time,
    duration_minutes, status, created_by)
  values (selected_business.id, p_group_1_option_id, p_group_2_option_id,
    trim(p_customer_name), normalized_whatsapp, p_date, p_start_time,
    p_start_time + pg_catalog.make_interval(mins => total_duration), total_duration,
    'scheduled'::public.appointment_status, current_user_id)
  returning id into new_appointment_id;
  return jsonb_build_object('appointment_id', new_appointment_id, 'appointment_date', p_date,
    'start_time', p_start_time, 'duration_minutes', total_duration, 'source', 'admin');
exception when exclusion_violation then raise exception 'booking_conflict' using errcode = '23P01'; end;
$$;

create or replace function public.update_admin_appointment_occurrence(
  p_appointment_id uuid, p_group_1_option_id uuid, p_group_2_option_id uuid,
  p_date date, p_start_time time, p_blocks integer, p_customer_name text, p_customer_whatsapp text
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid(); selected record; available jsonb; selected_slot jsonb;
  normalized_whatsapp text; total_duration integer;
begin
  if current_user_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_blocks is null or p_blocks < 1 or trim(coalesce(p_customer_name,'')) = '' then raise exception 'booking_invalid_input' using errcode = '22023'; end if;
  normalized_whatsapp := pg_catalog.regexp_replace(coalesce(p_customer_whatsapp,''),'\D','','g');
  if length(normalized_whatsapp) not between 10 and 15 then raise exception 'booking_invalid_whatsapp' using errcode = '22023'; end if;
  select appointment.* into selected from public.appointments appointment
  join public.business_members membership on membership.business_id = appointment.business_id
    and membership.user_id = current_user_id and membership.role in ('owner','admin')
  where appointment.id = p_appointment_id for update of appointment;
  if not found then raise exception 'appointment_not_found' using errcode = '42501'; end if;
  if selected.status <> 'scheduled'::public.appointment_status then raise exception 'appointment_invalid_status_transition' using errcode = '22023'; end if;
  available := private.get_admin_booking_availability(selected.business_id, p_date, p_group_1_option_id, p_group_2_option_id, selected.id);
  select item into selected_slot from jsonb_array_elements(available) item
  where left(item->>'start_time',5) = left(p_start_time::text,5) limit 1;
  if selected_slot is null or p_blocks > (selected_slot->>'max_blocks')::integer then raise exception 'booking_conflict' using errcode = '23P01'; end if;
  total_duration := (selected_slot->>'duration_minutes')::integer * p_blocks;
  update public.appointments set group_1_option_id = p_group_1_option_id,
    group_2_option_id = p_group_2_option_id, customer_name = trim(p_customer_name),
    customer_whatsapp = normalized_whatsapp, appointment_date = p_date,
    start_time = p_start_time, end_time = p_start_time + pg_catalog.make_interval(mins => total_duration),
    duration_minutes = total_duration where id = selected.id;
  return true;
exception when exclusion_violation then raise exception 'booking_conflict' using errcode = '23P01'; end;
$$;

create or replace function public.materialize_recurring_appointments(p_series_id uuid, p_horizon_date date default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid(); local_now timestamp := now() at time zone 'America/Sao_Paulo';
  selected_series public.appointment_series%rowtype; effective_horizon date; candidate record;
  availability jsonb; available_slot jsonb; conflicts jsonb := '[]'::jsonb; created_count integer := 0;
  previous_source text := current_setting('app.appointment_source',true);
  previous_series text := current_setting('app.appointment_series_id',true);
begin
  if current_user_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  select series.* into selected_series from public.appointment_series series
  where series.id = p_series_id and private.has_business_role(series.business_id,array['owner','admin']::public.business_role[])
  for update;
  if not found then raise exception 'appointment_series_not_found' using errcode = '42501'; end if;
  if not selected_series.active then return jsonb_build_object('series_id',selected_series.id,'created_count',0,'active',false); end if;
  perform pg_advisory_xact_lock(hashtextextended('appointment-series:' || selected_series.id::text,0));
  effective_horizon := case when selected_series.repeat_count is null
    then least(coalesce(p_horizon_date,local_now::date + 90),local_now::date + 90)
    else least(coalesce(p_horizon_date,selected_series.starts_on + ((selected_series.repeat_count-1)*7)),selected_series.starts_on + ((selected_series.repeat_count-1)*7)) end;
  for candidate in
    select selected_series.starts_on + ((number-1)*7) as appointment_date
    from generate_series(1,case when selected_series.repeat_count is not null then selected_series.repeat_count
      when effective_horizon < selected_series.starts_on then 0 else ((effective_horizon-selected_series.starts_on)/7)+1 end) number
    where selected_series.starts_on + ((number-1)*7) <= effective_horizon
      and (selected_series.starts_on + ((number-1)*7) > local_now::date or
        (selected_series.starts_on + ((number-1)*7) = local_now::date and selected_series.start_time > local_now::time))
      and not exists (select 1 from public.appointments appointment where appointment.series_id = selected_series.id
        and appointment.appointment_date = selected_series.starts_on + ((number-1)*7))
  loop
    availability := private.get_admin_booking_availability(selected_series.business_id,candidate.appointment_date,
      selected_series.group_1_option_id,selected_series.group_2_option_id,null);
    select item into available_slot from jsonb_array_elements(availability) item
    where item->>'start_time' = to_char(selected_series.start_time,'HH24:MI')
      and (item->>'max_blocks')::integer >= selected_series.blocks
      and (item->>'duration_minutes')::integer * selected_series.blocks = selected_series.duration_minutes limit 1;
    if not found then conflicts := conflicts || jsonb_build_array(jsonb_build_object('date',candidate.appointment_date,'start_time',to_char(selected_series.start_time,'HH24:MI'))); end if;
  end loop;
  if jsonb_array_length(conflicts)>0 then raise exception 'recurring_conflicts:%', conflicts::text using errcode='23P01', detail=conflicts::text; end if;
  perform set_config('app.appointment_source','admin',true);
  perform set_config('app.appointment_series_id',selected_series.id::text,true);
  for candidate in
    select selected_series.starts_on + ((number-1)*7) as appointment_date
    from generate_series(1,case when selected_series.repeat_count is not null then selected_series.repeat_count
      when effective_horizon < selected_series.starts_on then 0 else ((effective_horizon-selected_series.starts_on)/7)+1 end) number
    where selected_series.starts_on + ((number-1)*7) <= effective_horizon
      and (selected_series.starts_on + ((number-1)*7) > local_now::date or
        (selected_series.starts_on + ((number-1)*7) = local_now::date and selected_series.start_time > local_now::time))
      and not exists (select 1 from public.appointments appointment where appointment.series_id=selected_series.id
        and appointment.appointment_date=selected_series.starts_on + ((number-1)*7))
  loop
    insert into public.appointments (business_id,group_1_option_id,group_2_option_id,customer_name,
      customer_whatsapp,appointment_date,start_time,end_time,duration_minutes,status,created_by)
    values (selected_series.business_id,selected_series.group_1_option_id,selected_series.group_2_option_id,
      selected_series.customer_name,selected_series.customer_whatsapp,candidate.appointment_date,
      selected_series.start_time,selected_series.start_time + make_interval(mins=>selected_series.duration_minutes),
      selected_series.duration_minutes,'scheduled'::public.appointment_status,current_user_id);
    created_count := created_count + 1;
  end loop;
  perform set_config('app.appointment_source',coalesce(previous_source,''),true);
  perform set_config('app.appointment_series_id',coalesce(previous_series,''),true);
  return jsonb_build_object('series_id',selected_series.id,'created_count',created_count,'active',true,'materialized_through',effective_horizon);
end;
$$;

revoke all on function public.get_admin_booking_availability(date,uuid,uuid) from public;
revoke all on function public.get_admin_appointment_edit_availability(uuid,date,uuid,uuid) from public;
revoke all on function public.create_admin_appointment(uuid,uuid,date,time,integer,text,text) from public;
revoke all on function public.update_admin_appointment_occurrence(uuid,uuid,uuid,date,time,integer,text,text) from public;
revoke all on function public.materialize_recurring_appointments(uuid,date) from public;
grant execute on function public.get_admin_booking_availability(date,uuid,uuid) to authenticated;
grant execute on function public.get_admin_appointment_edit_availability(uuid,date,uuid,uuid) to authenticated;
grant execute on function public.create_admin_appointment(uuid,uuid,date,time,integer,text,text) to authenticated;
grant execute on function public.update_admin_appointment_occurrence(uuid,uuid,uuid,date,time,integer,text,text) to authenticated;
grant execute on function public.materialize_recurring_appointments(uuid,date) to authenticated;

comment on function private.get_admin_booking_availability(uuid,date,uuid,uuid,uuid) is
  'Authenticated administrative availability across the full day. It enforces business, group, duration, appointment and calendar-block rules but intentionally ignores public business_hours.';
comment on function public.get_admin_booking_availability(date,uuid,uuid) is
  'Owner/admin-only full-day availability. No anonymous bypass of public business_hours is exposed.';
comment on function public.create_admin_appointment(uuid,uuid,date,time,integer,text,text) is
  'Creates an administrative appointment inside or outside public business_hours while preserving duration, resource and conflict rules.';
