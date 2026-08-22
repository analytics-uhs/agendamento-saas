import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

export type PushNotificationContent = {
  title: string;
  message: string;
};

export type ClaimedPushNotification = PushNotificationContent & {
  notificationId: string;
  claimToken: string;
};

export type AdminPushSubscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type PushProcessingDependencies = {
  send: (subscription: AdminPushSubscription, payload: string) => Promise<void>;
  recordDelivery: (subscriptionId: string) => Promise<void>;
  removeExpired: (subscriptionId: string) => Promise<void>;
  complete: (outcome: "delivered" | "no_subscriptions") => Promise<void>;
  release: () => Promise<void>;
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

export async function processClaimedPushNotification(
  notification: ClaimedPushNotification,
  subscriptions: AdminPushSubscription[],
  deliveredSubscriptionIds: ReadonlySet<string>,
  dependencies: PushProcessingDependencies,
) {
  if (!subscriptions.length) {
    await dependencies.complete("no_subscriptions");
    return { sent: 0, removed: 0, retried: false, outcome: "no_subscriptions" as const };
  }

  let sent = 0;
  let removed = 0;
  let transientFailure = false;
  for (const subscription of subscriptions) {
    if (deliveredSubscriptionIds.has(subscription.id)) continue;
    try {
      await dependencies.send(subscription, buildAdminPushPayload(notification));
      await dependencies.recordDelivery(subscription.id);
      sent += 1;
    } catch (error) {
      if (isExpiredPushSubscription(error)) {
        try {
          await dependencies.removeExpired(subscription.id);
          removed += 1;
        } catch {
          transientFailure = true;
        }
      } else {
        transientFailure = true;
      }
    }
  }

  if (transientFailure) {
    await dependencies.release();
    return { sent, removed, retried: true, outcome: null };
  }

  const outcome = subscriptions.length === removed ? "no_subscriptions" : "delivered";
  await dependencies.complete(outcome);
  return { sent, removed, retried: false, outcome };
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
    { p_business_slug: businessSlug, p_limit: 100 },
  );
  if (claimError) throw new Error(`Não foi possível reservar a fila de push: ${claimError.message}`);
  if (!notifications.length) return { configured: true, sent: 0, removed: 0 };

  const release = async (notification: (typeof notifications)[number]) => {
    const { error } = await supabase.rpc("release_admin_push_notification", {
      p_notification_id: notification.notification_id,
      p_claim_token: notification.claim_token,
    });
    if (error) throw new Error(`Não foi possível liberar o claim de push: ${error.message}`);
  };

  try {
    const businessId = notifications[0].business_id;
    const recipientIds = [...new Set(notifications.map((notification) => notification.user_id))];
    const { data: subscriptions, error: subscriptionError } = await supabase
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth")
      .eq("business_id", businessId)
      .in("user_id", recipientIds);
    if (subscriptionError) throw new Error(`Não foi possível carregar subscriptions: ${subscriptionError.message}`);

    const notificationIds = notifications.map((notification) => notification.notification_id);
    const subscriptionIds = subscriptions.map((subscription) => subscription.id);
    const deliveryResult = subscriptionIds.length
      ? await supabase
          .from("admin_notification_push_deliveries")
          .select("notification_id, subscription_id")
          .in("notification_id", notificationIds)
          .in("subscription_id", subscriptionIds)
      : { data: [], error: null };
    if (deliveryResult.error) throw new Error(`Não foi possível carregar entregas anteriores: ${deliveryResult.error.message}`);

    webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
    let sent = 0;
    let removed = 0;
    let retried = 0;

    for (const notification of notifications) {
      const recipientSubscriptions = subscriptions.filter((subscription) => subscription.user_id === notification.user_id);
      const delivered = new Set(
        deliveryResult.data
          .filter((delivery) => delivery.notification_id === notification.notification_id)
          .map((delivery) => delivery.subscription_id),
      );
      const result = await processClaimedPushNotification(
        {
          notificationId: notification.notification_id,
          claimToken: notification.claim_token,
          title: notification.title,
          message: notification.message,
        },
        recipientSubscriptions,
        delivered,
        {
          send: (subscription, payload) => webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            payload,
          ).then(() => undefined),
          recordDelivery: async (subscriptionId) => {
            const { error } = await supabase.rpc("record_admin_push_delivery", {
              p_notification_id: notification.notification_id,
              p_subscription_id: subscriptionId,
              p_claim_token: notification.claim_token,
            });
            if (error) throw new Error(`Não foi possível registrar a entrega do push: ${error.message}`);
          },
          removeExpired: async (subscriptionId) => {
            const { error } = await supabase.from("push_subscriptions").delete().eq("id", subscriptionId);
            if (error) throw new Error(`Não foi possível remover a subscription expirada: ${error.message}`);
          },
          complete: async (outcome) => {
            const { error } = await supabase.rpc("complete_admin_push_notification", {
              p_notification_id: notification.notification_id,
              p_claim_token: notification.claim_token,
              p_outcome: outcome,
            });
            if (error) throw new Error(`Não foi possível confirmar o push: ${error.message}`);
          },
          release: () => release(notification),
        },
      );
      sent += result.sent;
      removed += result.removed;
      if (result.retried) retried += 1;
    }

    return { configured: true, sent, removed, retried };
  } catch (error) {
    await Promise.allSettled(notifications.map(release));
    throw error;
  }
}
