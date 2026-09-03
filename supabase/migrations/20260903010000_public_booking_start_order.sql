begin;

alter table public.business_settings
  add column public_booking_start_order text not null default 'service_first'
  constraint business_settings_public_booking_start_order_check
  check (public_booking_start_order in ('service_first', 'date_first'));

comment on column public.business_settings.public_booking_start_order is
  'Public UI step order only; does not change availability or booking rules.';

-- Preserve the curated payload and existing security; add only the UX setting.
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
      'public_booking_start_order',settings.public_booking_start_order,
      'allow_multiple_blocks',settings.allow_multiple_blocks,'palette',settings.palette,'theme_preference',settings.theme_preference))
  from public.businesses business join public.business_settings settings on settings.business_id=business.id
  where business.slug=lower(trim(p_slug)) and business.active limit 1;
$$;

commit;
