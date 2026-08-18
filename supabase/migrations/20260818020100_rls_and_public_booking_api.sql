-- Explicit grants, RLS policies, and the narrow anonymous booking read model.

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.booking_groups enable row level security;
alter table public.booking_options enable row level security;
alter table public.business_hours enable row level security;
alter table public.business_settings enable row level security;
alter table public.appointments enable row level security;

-- Reset Supabase's schema defaults before granting the minimum operations.
-- Anonymous users receive no direct table privileges. The public booking RPC
-- defined below is their only database read surface.
revoke all on table
  public.profiles,
  public.businesses,
  public.business_members,
  public.booking_groups,
  public.booking_options,
  public.business_hours,
  public.business_settings,
  public.appointments
from anon, authenticated;

revoke all on all sequences in schema public from anon, authenticated;

-- Authenticated grants are deliberately paired with restrictive RLS policies.
grant select, insert, update on table public.profiles to authenticated;
grant select, update on table public.businesses to authenticated;
grant select, insert, update, delete on table public.business_members to authenticated;
grant select, insert, update, delete on table public.booking_groups to authenticated;
grant select, insert, update, delete on table public.booking_options to authenticated;
grant select, insert, update, delete on table public.business_hours to authenticated;
grant select, insert, update, delete on table public.business_settings to authenticated;
grant select, insert, update, delete on table public.appointments to authenticated;

create policy profiles_select_own
on public.profiles
for select
to authenticated
using (id = (select auth.uid()));

create policy profiles_insert_own
on public.profiles
for insert
to authenticated
with check (id = (select auth.uid()));

create policy profiles_update_own
on public.profiles
for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy businesses_select_member_or_platform_admin
on public.businesses
for select
to authenticated
using (
  (select private.is_platform_admin())
  or (select private.is_business_member(businesses.id))
);

create policy businesses_update_admin_or_platform_admin
on public.businesses
for update
to authenticated
using (
  (select private.is_platform_admin())
  or (select private.has_business_role(
    businesses.id,
    array['owner', 'admin']::public.business_role[]
  ))
)
with check (
  (select private.is_platform_admin())
  or (select private.has_business_role(
    businesses.id,
    array['owner', 'admin']::public.business_role[]
  ))
);

create policy business_members_select_same_business_or_platform_admin
on public.business_members
for select
to authenticated
using (
  (select private.is_platform_admin())
  or (select private.is_business_member(business_id))
);

create policy business_members_insert_owner_or_platform_admin
on public.business_members
for insert
to authenticated
with check (
  (select private.is_platform_admin())
  or (select private.has_business_role(
    business_id,
    array['owner']::public.business_role[]
  ))
);

create policy business_members_update_owner_or_platform_admin
on public.business_members
for update
to authenticated
using (
  (select private.is_platform_admin())
  or (select private.has_business_role(
    business_id,
    array['owner']::public.business_role[]
  ))
)
with check (
  (select private.is_platform_admin())
  or (select private.has_business_role(
    business_id,
    array['owner']::public.business_role[]
  ))
);

create policy business_members_delete_owner_or_platform_admin
on public.business_members
for delete
to authenticated
using (
  (select private.is_platform_admin())
  or (select private.has_business_role(
    business_id,
    array['owner']::public.business_role[]
  ))
);

create policy booking_groups_select_member_or_platform_admin
on public.booking_groups
for select
to authenticated
using (
  (select private.is_platform_admin())
  or (select private.is_business_member(business_id))
);

create policy booking_groups_insert_admin_or_platform_admin
on public.booking_groups
for insert
to authenticated
with check (
  (select private.is_platform_admin())
  or (select private.has_business_role(
    business_id,
    array['owner', 'admin']::public.business_role[]
  ))
);

create policy booking_groups_update_admin_or_platform_admin
on public.booking_groups
for update
to authenticated
using (
  (select private.is_platform_admin())
  or (select private.has_business_role(
    business_id,
    array['owner', 'admin']::public.business_role[]
  ))
)
with check (
  (select private.is_platform_admin())
  or (select private.has_business_role(
    business_id,
    array['owner', 'admin']::public.business_role[]
  ))
);

create policy booking_groups_delete_admin_or_platform_admin
on public.booking_groups
for delete
to authenticated
using (
  (select private.is_platform_admin())
  or (select private.has_business_role(
    business_id,
    array['owner', 'admin']::public.business_role[]
  ))
);

create policy booking_options_select_member_or_platform_admin
on public.booking_options
for select
to authenticated
using (
  (select private.is_platform_admin())
  or (select private.is_business_member(business_id))
);

create policy booking_options_insert_admin_or_platform_admin
on public.booking_options
for insert
to authenticated
with check (
  (select private.is_platform_admin())
  or (select private.has_business_role(
    business_id,
    array['owner', 'admin']::public.business_role[]
  ))
);

create policy booking_options_update_admin_or_platform_admin
on public.booking_options
for update
to authenticated
using (
  (select private.is_platform_admin())
  or (select private.has_business_role(
    business_id,
    array['owner', 'admin']::public.business_role[]
  ))
)
with check (
  (select private.is_platform_admin())
  or (select private.has_business_role(
    business_id,
    array['owner', 'admin']::public.business_role[]
  ))
);

create policy booking_options_delete_admin_or_platform_admin
on public.booking_options
for delete
to authenticated
using (
  (select private.is_platform_admin())
  or (select private.has_business_role(
    business_id,
    array['owner', 'admin']::public.business_role[]
  ))
);

create policy business_hours_select_member_or_platform_admin
on public.business_hours
for select
to authenticated
using (
  (select private.is_platform_admin())
  or (select private.is_business_member(business_id))
);

create policy business_hours_insert_admin_or_platform_admin
on public.business_hours
for insert
to authenticated
with check (
  (select private.is_platform_admin())
  or (select private.has_business_role(
    business_id,
    array['owner', 'admin']::public.business_role[]
  ))
);

create policy business_hours_update_admin_or_platform_admin
on public.business_hours
for update
to authenticated
using (
  (select private.is_platform_admin())
  or (select private.has_business_role(
    business_id,
    array['owner', 'admin']::public.business_role[]
  ))
)
with check (
  (select private.is_platform_admin())
  or (select private.has_business_role(
    business_id,
    array['owner', 'admin']::public.business_role[]
  ))
);

create policy business_hours_delete_admin_or_platform_admin
on public.business_hours
for delete
to authenticated
using (
  (select private.is_platform_admin())
  or (select private.has_business_role(
    business_id,
    array['owner', 'admin']::public.business_role[]
  ))
);

create policy business_settings_select_member_or_platform_admin
on public.business_settings
for select
to authenticated
using (
  (select private.is_platform_admin())
  or (select private.is_business_member(business_id))
);

create policy business_settings_insert_admin_or_platform_admin
on public.business_settings
for insert
to authenticated
with check (
  (select private.is_platform_admin())
  or (select private.has_business_role(
    business_id,
    array['owner', 'admin']::public.business_role[]
  ))
);

create policy business_settings_update_admin_or_platform_admin
on public.business_settings
for update
to authenticated
using (
  (select private.is_platform_admin())
  or (select private.has_business_role(
    business_id,
    array['owner', 'admin']::public.business_role[]
  ))
)
with check (
  (select private.is_platform_admin())
  or (select private.has_business_role(
    business_id,
    array['owner', 'admin']::public.business_role[]
  ))
);

create policy business_settings_delete_admin_or_platform_admin
on public.business_settings
for delete
to authenticated
using (
  (select private.is_platform_admin())
  or (select private.has_business_role(
    business_id,
    array['owner', 'admin']::public.business_role[]
  ))
);

create policy appointments_select_member_or_platform_admin
on public.appointments
for select
to authenticated
using (
  (select private.is_platform_admin())
  or (select private.is_business_member(business_id))
);

create policy appointments_insert_admin_or_platform_admin
on public.appointments
for insert
to authenticated
with check (
  (
    (select private.is_platform_admin())
    or (select private.has_business_role(
      business_id,
      array['owner', 'admin']::public.business_role[]
    ))
  )
  and (created_by is null or created_by = (select auth.uid()))
);

create policy appointments_update_admin_or_platform_admin
on public.appointments
for update
to authenticated
using (
  (select private.is_platform_admin())
  or (select private.has_business_role(
    business_id,
    array['owner', 'admin']::public.business_role[]
  ))
)
with check (
  (select private.is_platform_admin())
  or (select private.has_business_role(
    business_id,
    array['owner', 'admin']::public.business_role[]
  ))
);

create policy appointments_delete_admin_or_platform_admin
on public.appointments
for delete
to authenticated
using (
  (select private.is_platform_admin())
  or (select private.has_business_role(
    business_id,
    array['owner', 'admin']::public.business_role[]
  ))
);

-- Narrow anonymous surface for the future public booking page. It returns one
-- active business and only active configuration rows; customer, member,
-- appointment, profile, and internal identifiers are never exposed.
create or replace function public.get_public_booking_page(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'business', jsonb_build_object(
      'name', business.name,
      'slug', business.slug,
      'whatsapp', business.whatsapp,
      'logo_url', business.logo_url
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
  join public.business_settings as settings
    on settings.business_id = business.id
  where business.slug = lower(trim(p_slug))
    and business.active
  limit 1;
$$;

revoke all on function public.get_public_booking_page(text) from public;
grant execute on function public.get_public_booking_page(text) to anon, authenticated;

comment on function public.get_public_booking_page(text) is
  'Curated anonymous read model for an active public booking page. Does not grant direct table access.';
