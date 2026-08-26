create type public.booking_group_occupancy_mode as enum ('time_slot', 'day');

alter table public.booking_groups
  add column occupancy_mode public.booking_group_occupancy_mode,
  add column intent_name text;

alter table public.booking_groups
  drop constraint booking_groups_position_check,
  add constraint booking_groups_position_check
    check (position in (1, 2, 3)),
  add constraint booking_groups_occupancy_mode_by_position_check
    check (
      (position in (1, 2) and occupancy_mode is null)
      or (position = 3 and occupancy_mode is not null)
    ),
  add constraint booking_groups_intent_name_check
    check (
      intent_name is null
      or char_length(trim(intent_name)) between 1 and 80
    );

comment on type public.booking_group_occupancy_mode is
  'How a complementary booking group occupies availability: a time interval or a whole calendar day.';

comment on column public.booking_groups.occupancy_mode is
  'Required only for the complementary group at position 3; positions 1 and 2 must remain null.';

comment on column public.booking_groups.intent_name is
  'Optional short configurable noun for future reservation-intent selectors; never derived from label.';
