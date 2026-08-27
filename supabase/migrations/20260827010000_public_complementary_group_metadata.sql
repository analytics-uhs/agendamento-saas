-- Extend the curated public booking payload with only the metadata required to
-- choose a complementary reservation intent. Legacy groups keep their exact
-- object shape.

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
        ) || case
          when booking_group.position = 3 then jsonb_build_object(
            'intent_name', booking_group.intent_name,
            'occupancy_mode', booking_group.occupancy_mode
          )
          else '{}'::jsonb
        end
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
  where business.slug = pg_catalog.lower(pg_catalog.btrim(p_slug))
    and business.active
  limit 1;
$$;

revoke all on function public.get_public_booking_page(text) from public;
grant execute on function public.get_public_booking_page(text) to anon, authenticated;

comment on function public.get_public_booking_page(text) is
  'Returns active public booking configuration; only complementary groups include intent_name and occupancy_mode.';
