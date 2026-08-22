-- Keep the server-side Web Push dispatcher on the least privileges it uses.

revoke all on table public.push_subscriptions from service_role;
grant select, delete on table public.push_subscriptions to service_role;

-- Delivery rows are inserted by a security-definer RPC. The dispatcher only
-- reads the ledger directly to skip devices already processed on a retry.
revoke all on table public.admin_notification_push_deliveries from service_role;
grant select on table public.admin_notification_push_deliveries to service_role;
