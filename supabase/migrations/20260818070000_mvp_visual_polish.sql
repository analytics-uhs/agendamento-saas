-- Public business contact details and binary visual theme defaults.

alter table public.businesses
add column address text,
add column google_maps_url text,
add column instagram_url text,
add column facebook_url text,
add constraint businesses_address_length check (address is null or char_length(address) <= 500),
add constraint businesses_google_maps_url_safe check (
  google_maps_url is null or (
    char_length(google_maps_url) <= 2048
    and google_maps_url ~* '^https?://[^[:space:]]+$'
  )
),
add constraint businesses_instagram_url_safe check (
  instagram_url is null or (
    char_length(instagram_url) <= 2048
    and instagram_url ~* '^https?://[^[:space:]]+$'
  )
),
add constraint businesses_facebook_url_safe check (
  facebook_url is null or (
    char_length(facebook_url) <= 2048
    and facebook_url ~* '^https?://[^[:space:]]+$'
  )
);

comment on column public.businesses.address is 'Optional public address displayed in the booking header.';
comment on column public.businesses.google_maps_url is 'Optional HTTP(S) Google Maps location link.';
comment on column public.businesses.instagram_url is 'Optional HTTP(S) Instagram profile link.';
comment on column public.businesses.facebook_url is 'Optional HTTP(S) Facebook page link.';

grant update (address, google_maps_url, instagram_url, facebook_url)
on table public.businesses to authenticated;

-- Keep activation exclusively behind the platform-admin RPC. This explicit
-- revoke also protects environments where a broader legacy grant existed.
revoke update (active) on table public.businesses from authenticated;

update public.business_settings
set theme_preference = 'light'::public.theme_preference
where theme_preference = 'system'::public.theme_preference;

alter table public.business_settings
alter column theme_preference set default 'light'::public.theme_preference;

create or replace function public.complete_business_onboarding(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  new_business_id uuid;
  group_record record;
  group_id uuid;
  option_record record;
  hour_record record;
  duration_mode_text text := p_payload #>> '{settings,duration_mode}';
  fixed_minutes integer := (p_payload #>> '{settings,fixed_duration_minutes}')::integer;
  theme_text text := case
    when p_payload #>> '{settings,theme_preference}' = 'dark' then 'dark'
    else 'light'
  end;
begin
  if current_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.business_members where user_id = current_user_id
  ) then
    raise exception 'user already has a business' using errcode = '23505';
  end if;

  if coalesce(jsonb_typeof(p_payload -> 'groups'), '') <> 'array'
    or jsonb_array_length(p_payload -> 'groups') <> 2
    or (select count(distinct (value ->> 'position')::integer) from jsonb_array_elements(p_payload -> 'groups')) <> 2
    or exists (
      select 1 from jsonb_array_elements(p_payload -> 'groups')
      where (value ->> 'position')::integer not in (1, 2)
    ) then
    raise exception 'exactly groups 1 and 2 are required' using errcode = '22023';
  end if;

  if coalesce(jsonb_typeof(p_payload -> 'hours'), '') <> 'array'
    or jsonb_array_length(p_payload -> 'hours') <> 7
    or (select count(distinct (value ->> 'weekday')::integer) from jsonb_array_elements(p_payload -> 'hours')) <> 7
    or exists (
      select 1 from jsonb_array_elements(p_payload -> 'hours')
      where (value ->> 'weekday')::integer not between 0 and 6
    ) then
    raise exception 'all seven weekdays are required' using errcode = '22023';
  end if;

  if duration_mode_text not in ('fixed', 'fixed_multiple', 'group_2') then
    raise exception 'invalid duration mode' using errcode = '22023';
  end if;

  if fixed_minutes is null or fixed_minutes <= 0 then
    raise exception 'fixed duration must be positive' using errcode = '22023';
  end if;

  if duration_mode_text = 'group_2' and exists (
    select 1
    from jsonb_array_elements(p_payload -> 'groups') as selected_group,
      jsonb_array_elements(selected_group -> 'options') as selected_option
    where (selected_group ->> 'position')::integer = 2
      and coalesce((selected_option ->> 'duration_minutes')::integer, 0) <= 0
  ) then
    raise exception 'group 2 options require a duration' using errcode = '22023';
  end if;

  new_business_id := public.create_business_with_owner(
    p_payload ->> 'name',
    p_payload ->> 'slug',
    p_payload ->> 'whatsapp'
  );

  update public.businesses
  set
    address = nullif(trim(p_payload ->> 'address'), ''),
    google_maps_url = nullif(trim(p_payload ->> 'google_maps_url'), ''),
    instagram_url = nullif(trim(p_payload ->> 'instagram_url'), ''),
    facebook_url = nullif(trim(p_payload ->> 'facebook_url'), '')
  where id = new_business_id;

  for group_record in select value from jsonb_array_elements(p_payload -> 'groups') loop
    update public.booking_groups
    set
      label = trim(group_record.value ->> 'label'),
      active = coalesce((group_record.value ->> 'active')::boolean, true),
      required = coalesce((group_record.value ->> 'required')::boolean, true),
      sort_order = (group_record.value ->> 'position')::integer
    where business_id = new_business_id
      and position = (group_record.value ->> 'position')::integer
    returning id into group_id;

    for option_record in select value, ordinality from jsonb_array_elements(group_record.value -> 'options') with ordinality loop
      insert into public.booking_options (
        business_id, group_id, name, duration_minutes, active, sort_order
      ) values (
        new_business_id,
        group_id,
        trim(option_record.value ->> 'name'),
        case
          when duration_mode_text = 'group_2' and (group_record.value ->> 'position')::integer = 2
            then (option_record.value ->> 'duration_minutes')::integer
          else null
        end,
        true,
        coalesce((option_record.value ->> 'sort_order')::integer, option_record.ordinality::integer - 1)
      );
    end loop;
  end loop;

  for hour_record in select value from jsonb_array_elements(p_payload -> 'hours') loop
    update public.business_hours
    set
      active = coalesce((hour_record.value ->> 'active')::boolean, false),
      start_time = (hour_record.value ->> 'start_time')::time,
      end_time = (hour_record.value ->> 'end_time')::time
    where business_id = new_business_id
      and weekday = (hour_record.value ->> 'weekday')::integer;
  end loop;

  update public.business_settings
  set
    duration_mode = duration_mode_text::public.duration_mode,
    fixed_duration_minutes = fixed_minutes,
    allow_multiple_blocks = duration_mode_text = 'fixed_multiple',
    palette = p_payload #> '{settings,palette}',
    theme_preference = theme_text::public.theme_preference
  where business_id = new_business_id;

  return new_business_id;
end;
$$;

revoke all on function public.complete_business_onboarding(jsonb) from public;
grant execute on function public.complete_business_onboarding(jsonb) to authenticated;

create or replace function public.get_public_booking_page(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'business', jsonb_build_object(
      'id', business.id,
      'name', business.name,
      'slug', business.slug,
      'whatsapp', business.whatsapp,
      'logo_url', business.logo_url,
      'address', business.address,
      'google_maps_url', business.google_maps_url,
      'instagram_url', business.instagram_url,
      'facebook_url', business.facebook_url
    ),
    'groups', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'position', booking_group.position,
          'label', booking_group.label,
          'required', booking_group.required,
          'options', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', booking_option.id,
                'name', booking_option.name,
                'duration_minutes', booking_option.duration_minutes
              )
              order by booking_option.sort_order, booking_option.name
            )
            from public.booking_options as booking_option
            where booking_option.business_id = business.id
              and booking_option.group_id = booking_group.id
              and booking_option.active
          ), '[]'::jsonb)
        )
        order by booking_group.sort_order, booking_group.position
      )
      from public.booking_groups as booking_group
      where booking_group.business_id = business.id
        and booking_group.active
    ), '[]'::jsonb),
    'hours', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'weekday', business_hour.weekday,
          'start_time', business_hour.start_time,
          'end_time', business_hour.end_time
        )
        order by business_hour.weekday
      )
      from public.business_hours as business_hour
      where business_hour.business_id = business.id
        and business_hour.active
    ), '[]'::jsonb),
    'settings', jsonb_build_object(
      'duration_mode', settings.duration_mode,
      'fixed_duration_minutes', settings.fixed_duration_minutes,
      'allow_multiple_blocks', settings.allow_multiple_blocks,
      'palette', settings.palette,
      'theme_preference', settings.theme_preference
    )
  )
  from public.businesses as business
  join public.business_settings as settings on settings.business_id = business.id
  where business.slug = lower(trim(p_slug))
    and business.active
  limit 1;
$$;

revoke all on function public.get_public_booking_page(text) from public;
grant execute on function public.get_public_booking_page(text) to anon, authenticated;

comment on function public.complete_business_onboarding(jsonb) is
  'Atomically creates the first business with optional public contact fields and a light/dark theme.';
comment on function public.get_public_booking_page(text) is
  'Returns only active public booking configuration and explicitly curated contact links.';
