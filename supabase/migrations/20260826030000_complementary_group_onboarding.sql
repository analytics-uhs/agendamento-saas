-- Extend onboarding atomically with the optional complementary catalog while
-- preserving the proven legacy implementation for positions 1 and 2.

create or replace function public.complete_business_onboarding(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  legacy_payload jsonb;
  complementary_group jsonb;
  selected_option record;
  complementary_group_id uuid;
  new_business_id uuid;
begin
  if coalesce(jsonb_typeof(p_payload -> 'groups'), '') <> 'array'
    or jsonb_array_length(p_payload -> 'groups') not between 2 and 3
    or (select count(*) from jsonb_array_elements(p_payload -> 'groups') as selected(value)
        where (value ->> 'position')::integer = 1) <> 1
    or (select count(*) from jsonb_array_elements(p_payload -> 'groups') as selected(value)
        where (value ->> 'position')::integer = 2) <> 1
    or (select count(*) from jsonb_array_elements(p_payload -> 'groups') as selected(value)
        where (value ->> 'position')::integer = 3) > 1
    or exists (
      select 1
      from jsonb_array_elements(p_payload -> 'groups') as selected(value)
      where (value ->> 'position')::integer not in (1, 2, 3)
    )
  then
    raise exception 'onboarding_groups_invalid' using errcode = '22023';
  end if;

  select selected.value
  into complementary_group
  from jsonb_array_elements(p_payload -> 'groups') as selected(value)
  where (selected.value ->> 'position')::integer = 3;

  if complementary_group is not null then
    if nullif(trim(complementary_group ->> 'label'), '') is null then
      raise exception 'complementary_group_label_required' using errcode = '22023';
    end if;

    if coalesce(complementary_group ->> 'occupancy_mode', '') not in ('time_slot', 'day') then
      raise exception 'complementary_group_occupancy_mode_required' using errcode = '22023';
    end if;

    if complementary_group ->> 'intent_name' is not null
      and (
        nullif(trim(complementary_group ->> 'intent_name'), '') is null
        or char_length(trim(complementary_group ->> 'intent_name')) > 80
      )
    then
      raise exception 'complementary_group_intent_name_invalid' using errcode = '22023';
    end if;

    if coalesce(jsonb_typeof(complementary_group -> 'options'), '') <> 'array'
      or (
        coalesce((complementary_group ->> 'active')::boolean, false)
        and jsonb_array_length(complementary_group -> 'options') = 0
      )
      or exists (
        select 1
        from jsonb_array_elements(complementary_group -> 'options') as selected(value)
        where nullif(trim(selected.value ->> 'name'), '') is null
      )
    then
      raise exception 'complementary_group_options_invalid' using errcode = '22023';
    end if;
  end if;

  select jsonb_set(
    p_payload,
    '{groups}',
    jsonb_agg(selected.value order by (selected.value ->> 'position')::integer)
  )
  into legacy_payload
  from jsonb_array_elements(p_payload -> 'groups') as selected(value)
  where (selected.value ->> 'position')::integer in (1, 2);

  new_business_id := public.complete_business_onboarding_before_founder_offer(legacy_payload);

  if complementary_group is not null then
    insert into public.booking_groups (
      business_id,
      position,
      label,
      active,
      required,
      sort_order,
      occupancy_mode,
      intent_name
    ) values (
      new_business_id,
      3,
      trim(complementary_group ->> 'label'),
      coalesce((complementary_group ->> 'active')::boolean, false),
      false,
      3,
      (complementary_group ->> 'occupancy_mode')::public.booking_group_occupancy_mode,
      nullif(trim(complementary_group ->> 'intent_name'), '')
    )
    returning id into complementary_group_id;

    for selected_option in
      select value, ordinality
      from jsonb_array_elements(complementary_group -> 'options') with ordinality
    loop
      insert into public.booking_options (
        business_id,
        group_id,
        name,
        duration_minutes,
        active,
        sort_order
      ) values (
        new_business_id,
        complementary_group_id,
        trim(selected_option.value ->> 'name'),
        null,
        true,
        coalesce(
          (selected_option.value ->> 'sort_order')::integer,
          selected_option.ordinality::integer - 1
        )
      );
    end loop;
  end if;

  perform private.claim_founder_offer(new_business_id);
  return new_business_id;
end;
$$;

revoke all on function public.complete_business_onboarding(jsonb) from public, anon;
grant execute on function public.complete_business_onboarding(jsonb) to authenticated;

comment on function public.complete_business_onboarding(jsonb) is
  'Atomically delegates positions 1/2 to the legacy onboarding, persists an optional position-3 catalog, and records the founder-offer claim.';
