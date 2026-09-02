-- booking_option_hours is managed only by the authenticated configuration RPC.
-- The dispatcher/service role has no use for this table.

revoke all on table public.booking_option_hours from service_role;
