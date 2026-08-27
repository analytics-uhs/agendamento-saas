import { createClient } from "@/lib/supabase/server";
import { mapAdminNotification } from "@/lib/admin-notifications";
import type { AdminNotificationFeed, BrowserPushSubscriptionInput } from "@/types/admin-notifications";

const notificationColumns = "id, business_id, user_id, type, title, message, appointment_id, reservation_resource_id, read_at, created_at";

export async function getAdminNotificationFeed(businessId: string): Promise<AdminNotificationFeed> {
  const supabase = await createClient();
  const [itemsResult, countResult] = await Promise.all([
    supabase
      .from("admin_notifications")
      .select(notificationColumns)
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("admin_notifications")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .is("read_at", null),
  ]);
  const error = itemsResult.error ?? countResult.error;
  if (error) throw new Error(`Não foi possível carregar as notificações: ${error.message}`);
  return {
    items: (itemsResult.data ?? []).map(mapAdminNotification),
    unreadCount: countResult.count ?? 0,
  };
}

export async function markAdminNotificationRead(notificationId: string) {
  const supabase = await createClient();
  return supabase.rpc("mark_admin_notification_read", { p_notification_id: notificationId });
}

export async function markAllAdminNotificationsRead(businessId: string) {
  const supabase = await createClient();
  return supabase.rpc("mark_all_admin_notifications_read", { p_business_id: businessId });
}

export async function savePushSubscription(businessId: string, subscription: BrowserPushSubscriptionInput) {
  const supabase = await createClient();
  return supabase.rpc("save_push_subscription", {
    p_business_id: businessId,
    p_endpoint: subscription.endpoint,
    p_p256dh: subscription.p256dh,
    p_auth: subscription.auth,
    p_user_agent: subscription.userAgent,
  });
}

export async function removePushSubscription(endpoint: string) {
  const supabase = await createClient();
  return supabase.rpc("remove_push_subscription", { p_endpoint: endpoint });
}
