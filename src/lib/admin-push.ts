import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

export type PushNotificationContent = {
  title: string;
  message: string;
};

export function buildAdminPushPayload(notification: PushNotificationContent) {
  return JSON.stringify({
    title: notification.title,
    body: notification.message,
    icon: "/icon.png",
    badge: "/icon.png",
    url: "/admin",
    tag: "new-public-appointment",
  });
}

export function isExpiredPushSubscription(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const statusCode = "statusCode" in error ? error.statusCode : null;
  return statusCode === 404 || statusCode === 410;
}

export async function safelyRunPushEffect(effect: () => Promise<void>) {
  try {
    await effect();
    return true;
  } catch {
    return false;
  }
}

function getVapidConfiguration() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return publicKey && privateKey && subject && serviceRoleKey
    ? { publicKey, privateKey, subject }
    : null;
}

export async function dispatchPendingAdminPushes(businessSlug: string) {
  const vapid = getVapidConfiguration();
  if (!vapid) return { configured: false, sent: 0, removed: 0 };

  const supabase = createAdminClient();
  const { data: notifications, error: claimError } = await supabase.rpc(
    "claim_pending_admin_push_notifications",
    { p_business_slug: businessSlug },
  );
  if (claimError) throw new Error(`Não foi possível reservar a fila de push: ${claimError.message}`);
  if (!notifications.length) return { configured: true, sent: 0, removed: 0 };

  const businessId = notifications[0].business_id;
  const recipientIds = [...new Set(notifications.map((notification) => notification.user_id))];
  const { data: subscriptions, error: subscriptionError } = await supabase
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .eq("business_id", businessId)
    .in("user_id", recipientIds);
  if (subscriptionError) throw new Error(`Não foi possível carregar subscriptions: ${subscriptionError.message}`);

  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  let sent = 0;
  let removed = 0;

  for (const notification of notifications) {
    const recipientSubscriptions = subscriptions.filter((subscription) => subscription.user_id === notification.user_id);
    for (const subscription of recipientSubscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          buildAdminPushPayload(notification),
        );
        sent += 1;
      } catch (error) {
        if (isExpiredPushSubscription(error)) {
          const { error: removeError } = await supabase
            .from("push_subscriptions")
            .delete()
            .eq("id", subscription.id);
          if (!removeError) removed += 1;
        }
      }
    }
  }

  return { configured: true, sent, removed };
}
