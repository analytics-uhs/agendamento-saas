-- Atomic first-business onboarding and a narrowly scoped logo bucket.

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
    theme_preference = (p_payload #>> '{settings,theme_preference}')::public.theme_preference
  where business_id = new_business_id;

  return new_business_id;
end;
$$;

revoke all on function public.complete_business_onboarding(jsonb) from public;
grant execute on function public.complete_business_onboarding(jsonb) to authenticated;

comment on function public.complete_business_onboarding(jsonb) is
  'Atomically creates and configures the authenticated user first business.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'business-logos',
  'business-logos',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.can_manage_business_logo(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_platform_admin() or exists (
    select 1
    from public.business_members
    where business_id::text = (storage.foldername(object_name))[1]
      and user_id = (select auth.uid())
      and role = any(array['owner', 'admin']::public.business_role[])
  );
$$;

revoke all on function private.can_manage_business_logo(text) from public;
grant execute on function private.can_manage_business_logo(text) to authenticated;

-- Public object URLs are served by the public bucket. Metadata listing remains
-- private; authenticated managers receive SELECT only for their own prefix so
-- that Storage upserts can safely detect an existing object.
create policy business_logos_admin_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'business-logos'
  and (select private.can_manage_business_logo(name))
);

create policy business_logos_admin_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'business-logos'
  and (select private.can_manage_business_logo(name))
);

create policy business_logos_admin_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'business-logos'
  and (select private.can_manage_business_logo(name))
)
with check (
  bucket_id = 'business-logos'
  and (select private.can_manage_business_logo(name))
);

create policy business_logos_admin_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'business-logos'
  and (select private.can_manage_business_logo(name))
);
