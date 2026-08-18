-- Controlled platform administration surface.

alter table public.businesses
add column active_updated_at timestamptz,
add column active_updated_by uuid references auth.users (id) on delete set null;

comment on column public.businesses.active_updated_at is
  'Timestamp of the latest platform-admin activation status change.';
comment on column public.businesses.active_updated_by is
  'Platform administrator who last changed the activation status.';

-- Business members may edit public business attributes, but activation is a
-- platform operation. Removing the table-level grant prevents an inactive
-- owner from reactivating the business through the Data API.
revoke update on table public.businesses from authenticated;
grant update (name, slug, whatsapp, logo_url) on table public.businesses to authenticated;

create or replace function public.is_current_user_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and (select private.is_platform_admin());
$$;

create or replace function public.get_platform_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  local_today date := (now() at time zone 'America/Sao_Paulo')::date;
  result jsonb;
begin
  if (select auth.uid()) is null or not (select private.is_platform_admin()) then
    raise exception 'platform_admin_forbidden' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'total_businesses', count(*),
    'active_businesses', count(*) filter (where business.active),
    'inactive_businesses', count(*) filter (where not business.active),
    'new_businesses_30_days', count(*) filter (where business.created_at >= now() - interval '30 days'),
    'appointments_today', (
      select count(*) from public.appointments as appointment
      where appointment.appointment_date = local_today
        and appointment.status <> 'cancelled'::public.appointment_status
    ),
    'future_appointments', (
      select count(*) from public.appointments as appointment
      where appointment.appointment_date > local_today
        and appointment.status = 'scheduled'::public.appointment_status
    )
  ) into result
  from public.businesses as business;

  return result;
end;
$$;

create or replace function public.list_platform_businesses(
  p_search text default null,
  p_active boolean default null,
  p_page integer default 1,
  p_page_size integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_search text := nullif(trim(coalesce(p_search, '')), '');
  safe_page integer := greatest(coalesce(p_page, 1), 1);
  safe_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 100);
  total_count bigint;
  items jsonb;
  local_now timestamp := now() at time zone 'America/Sao_Paulo';
begin
  if (select auth.uid()) is null or not (select private.is_platform_admin()) then
    raise exception 'platform_admin_forbidden' using errcode = '42501';
  end if;

  select count(*) into total_count
  from public.businesses as business
  where (p_active is null or business.active = p_active)
    and (
      normalized_search is null
      or business.name ilike '%' || normalized_search || '%'
      or business.slug ilike '%' || normalized_search || '%'
    );

  select coalesce(jsonb_agg(to_jsonb(page_row) order by page_row.created_at desc, page_row.id), '[]'::jsonb)
  into items
  from (
    select
      business.id,
      business.name,
      business.slug,
      business.active,
      business.created_at,
      coalesce(member_count.value, 0) as member_count,
      coalesce(appointment_count.value, 0) as appointment_count,
      next_appointment.value as next_appointment
    from public.businesses as business
    left join lateral (
      select count(*)::bigint as value
      from public.business_members as membership
      where membership.business_id = business.id
    ) as member_count on true
    left join lateral (
      select count(*)::bigint as value
      from public.appointments as appointment
      where appointment.business_id = business.id
    ) as appointment_count on true
    left join lateral (
      select min(appointment.appointment_date + appointment.start_time) as value
      from public.appointments as appointment
      where appointment.business_id = business.id
        and appointment.status = 'scheduled'::public.appointment_status
        and appointment.appointment_date + appointment.start_time > local_now
    ) as next_appointment on true
    where (p_active is null or business.active = p_active)
      and (
        normalized_search is null
        or business.name ilike '%' || normalized_search || '%'
        or business.slug ilike '%' || normalized_search || '%'
      )
    order by business.created_at desc, business.id
    limit safe_page_size
    offset (safe_page - 1) * safe_page_size
  ) as page_row;

  return jsonb_build_object(
    'items', items,
    'total', total_count,
    'page', safe_page,
    'page_size', safe_page_size,
    'total_pages', greatest(ceil(total_count::numeric / safe_page_size)::integer, 1)
  );
end;
$$;

create or replace function public.get_platform_business_detail(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
  local_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if (select auth.uid()) is null or not (select private.is_platform_admin()) then
    raise exception 'platform_admin_forbidden' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'business', jsonb_build_object(
      'id', business.id,
      'name', business.name,
      'slug', business.slug,
      'whatsapp', business.whatsapp,
      'logo_url', business.logo_url,
      'active', business.active,
      'created_at', business.created_at,
      'updated_at', business.updated_at,
      'active_updated_at', business.active_updated_at,
      'active_updated_by', business.active_updated_by
    ),
    'settings', case when settings.business_id is null then null else jsonb_build_object(
      'duration_mode', settings.duration_mode,
      'fixed_duration_minutes', settings.fixed_duration_minutes,
      'allow_multiple_blocks', settings.allow_multiple_blocks,
      'palette', settings.palette,
      'theme_preference', settings.theme_preference
    ) end,
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', booking_group.position,
        'label', booking_group.label,
        'active', booking_group.active,
        'required', booking_group.required,
        'options', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', booking_option.id,
            'name', booking_option.name,
            'duration_minutes', booking_option.duration_minutes,
            'active', booking_option.active
          ) order by booking_option.sort_order, booking_option.name)
          from public.booking_options as booking_option
          where booking_option.group_id = booking_group.id
            and booking_option.business_id = business.id
        ), '[]'::jsonb)
      ) order by booking_group.position)
      from public.booking_groups as booking_group
      where booking_group.business_id = business.id
    ), '[]'::jsonb),
    'hours', coalesce((
      select jsonb_agg(jsonb_build_object(
        'weekday', business_hour.weekday,
        'active', business_hour.active,
        'start_time', business_hour.start_time,
        'end_time', business_hour.end_time
      ) order by business_hour.weekday)
      from public.business_hours as business_hour
      where business_hour.business_id = business.id
    ), '[]'::jsonb),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', membership.id,
        'user_id', membership.user_id,
        'name', profile.name,
        'email', auth_user.email,
        'role', membership.role,
        'created_at', membership.created_at
      ) order by membership.created_at, membership.id)
      from public.business_members as membership
      join public.profiles as profile on profile.id = membership.user_id
      join auth.users as auth_user on auth_user.id = membership.user_id
      where membership.business_id = business.id
    ), '[]'::jsonb),
    'appointment_summary', jsonb_build_object(
      'today', (select count(*) from public.appointments where business_id = business.id and appointment_date = local_today),
      'future', (select count(*) from public.appointments where business_id = business.id and appointment_date > local_today and status = 'scheduled'::public.appointment_status),
      'completed', (select count(*) from public.appointments where business_id = business.id and status = 'completed'::public.appointment_status),
      'cancelled', (select count(*) from public.appointments where business_id = business.id and status = 'cancelled'::public.appointment_status),
      'no_show', (select count(*) from public.appointments where business_id = business.id and status = 'no_show'::public.appointment_status)
    ),
    'recent_appointments', coalesce((
      select jsonb_agg(to_jsonb(recent_row) order by recent_row.appointment_date desc, recent_row.start_time desc)
      from (
        select
          appointment.id,
          appointment.customer_name,
          appointment.appointment_date,
          appointment.start_time,
          appointment.end_time,
          appointment.status,
          appointment.source,
          group_1_option.name as group_1_name,
          group_2_option.name as group_2_name
        from public.appointments as appointment
        left join public.booking_options as group_1_option on group_1_option.id = appointment.group_1_option_id
        left join public.booking_options as group_2_option on group_2_option.id = appointment.group_2_option_id
        where appointment.business_id = business.id
        order by appointment.appointment_date desc, appointment.start_time desc
        limit 20
      ) as recent_row
    ), '[]'::jsonb)
  ) into result
  from public.businesses as business
  left join public.business_settings as settings on settings.business_id = business.id
  where business.id = p_business_id;

  return result;
end;
$$;

create or replace function public.set_platform_business_active(
  p_business_id uuid,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_business record;
begin
  if (select auth.uid()) is null or not (select private.is_platform_admin()) then
    raise exception 'platform_admin_forbidden' using errcode = '42501';
  end if;
  if p_business_id is null or p_active is null then
    raise exception 'platform_admin_invalid_business_status' using errcode = '22023';
  end if;

  update public.businesses
  set
    active = p_active,
    active_updated_at = case when active is distinct from p_active then now() else active_updated_at end,
    active_updated_by = case when active is distinct from p_active then (select auth.uid()) else active_updated_by end
  where id = p_business_id
  returning id, active, updated_at, active_updated_at, active_updated_by
  into updated_business;

  if not found then
    raise exception 'platform_admin_business_not_found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'id', updated_business.id,
    'active', updated_business.active,
    'updated_at', updated_business.updated_at,
    'active_updated_at', updated_business.active_updated_at,
    'active_updated_by', updated_business.active_updated_by
  );
end;
$$;

revoke all on function public.is_current_user_platform_admin() from public;
revoke all on function public.get_platform_metrics() from public;
revoke all on function public.list_platform_businesses(text, boolean, integer, integer) from public;
revoke all on function public.get_platform_business_detail(uuid) from public;
revoke all on function public.set_platform_business_active(uuid, boolean) from public;

grant execute on function public.is_current_user_platform_admin() to authenticated;
grant execute on function public.get_platform_metrics() to authenticated;
grant execute on function public.list_platform_businesses(text, boolean, integer, integer) to authenticated;
grant execute on function public.get_platform_business_detail(uuid) to authenticated;
grant execute on function public.set_platform_business_active(uuid, boolean) to authenticated;

comment on function public.is_current_user_platform_admin() is
  'Returns only whether the authenticated caller belongs to the private platform admin allow-list.';
comment on function public.get_platform_metrics() is
  'Returns aggregate SaaS metrics after explicit platform-admin authorization.';
comment on function public.list_platform_businesses(text, boolean, integer, integer) is
  'Returns a filtered, paginated business list with database-side aggregates for platform administrators.';
comment on function public.get_platform_business_detail(uuid) is
  'Returns one curated platform-admin business detail, including member email but no authentication metadata.';
comment on function public.set_platform_business_active(uuid, boolean) is
  'Changes business activation after platform-admin authorization and records the actor and timestamp.';
