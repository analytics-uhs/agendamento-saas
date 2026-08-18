-- Appointments are immutable through direct authenticated Data API access.
-- Mutations must go through the validated security-definer RPCs, whose owner
-- privileges are unaffected by revoking grants from the caller role.
grant select on table public.appointments to authenticated;
revoke insert, update, delete on table public.appointments from authenticated;

