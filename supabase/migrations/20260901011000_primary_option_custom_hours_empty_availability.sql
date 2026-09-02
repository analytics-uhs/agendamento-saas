-- Preserve the legacy empty-array contract for unavailable/unknown slugs.
-- The engine migration's SQL wrappers returned null when their business
-- lookup produced no row.

create or replace function private.get_booking_availability_without_calendar_blocks(
  p_slug text,
  p_date date,
  p_group_1_option_id uuid,
  p_group_2_option_id uuid,
  p_exclude_appointment_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select private.get_primary_booking_availability(
      business.id,
      p_date,
      p_group_1_option_id,
      p_group_2_option_id,
      p_exclude_appointment_id,
      true,
      false
    )
    from public.businesses business
    where business.slug = lower(trim(p_slug))
      and business.active
  ), '[]'::jsonb);
$$;

create or replace function private.get_booking_availability(
  p_slug text,
  p_date date,
  p_group_1_option_id uuid,
  p_group_2_option_id uuid,
  p_exclude_appointment_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select private.get_primary_booking_availability(
      business.id,
      p_date,
      p_group_1_option_id,
      p_group_2_option_id,
      p_exclude_appointment_id,
      true,
      true
    )
    from public.businesses business
    where business.slug = lower(trim(p_slug))
      and business.active
  ), '[]'::jsonb);
$$;

revoke all on function private.get_booking_availability_without_calendar_blocks(text,date,uuid,uuid,uuid)
  from public, anon, authenticated;
revoke all on function private.get_booking_availability(text,date,uuid,uuid,uuid)
  from public, anon, authenticated;
