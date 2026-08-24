-- Rebind the public availability facade after the private engine wrapper was
-- introduced. SQL functions bind referenced function OIDs when created, so
-- the pre-existing facade still called the renamed unfiltered implementation.

create or replace function public.get_booking_availability(
  p_slug text,
  p_date date,
  p_group_1_option_id uuid,
  p_group_2_option_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.get_booking_availability(
    p_slug,
    p_date,
    p_group_1_option_id,
    p_group_2_option_id,
    null
  );
$$;

revoke all on function public.get_booking_availability(text, date, uuid, uuid) from public;
grant execute on function public.get_booking_availability(text, date, uuid, uuid) to anon, authenticated;

comment on function public.get_booking_availability(text, date, uuid, uuid) is
  'Public availability facade bound to the shared booking engine that includes administrative calendar blocks.';
