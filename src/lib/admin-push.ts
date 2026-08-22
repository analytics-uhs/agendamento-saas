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
  reportError?: (
    stage: "send" | "record_delivery" | "remove_expired" | "complete" | "release",
    error: unknown,
  ) => void;
};

export type AdminPushEnvironmentStatus = {
  serviceRoleConfigured: boolean;
  vapidPublicConfigured: boolean;
  vapidPrivateConfigured: boolean;
  vapidSubjectConfigured: boolean;
};

export type AdminPushDiagnostic = {
  stage: string;
  message?: string;
  statusCode?: number;
  notifications?: number;
  subscriptions?: number;
  sent?: number;
  removed?: number;
  retried?: number;
  claimResult?: "empty" | "claimed";
  environment?: AdminPushEnvironmentStatus;
};

type AdminPushLogger = (event: string, diagnostic: AdminPushDiagnostic) => void;

function redactPushErrorMessage(message: string) {
  return message.replace(/https?:\/\/\S+/gi, "[url]").slice(0, 500);
}

export function getSafePushError(error: unknown) {
  const message = error instanceof Error ? error.message : "Erro desconhecido no Web Push";
  const rawStatusCode = error && typeof error === "object" && "statusCode" in error ? error.statusCode : null;
  return {
    message: redactPushErrorMessage(message),
    statusCode: typeof rawStatusCode === "number" ? rawStatusCode : undefined,
  };
}

function serverPushLogger(event: string, diagnostic: AdminPushDiagnostic) {
  const method = event.endsWith("failed") || event.endsWith("missing") ? console.error : console.info;
  method(`[admin-push] ${event}`, diagnostic);
}

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

export async function safelyRunPushEffect(
  effect: () => Promise<void>,
  logger: AdminPushLogger = serverPushLogger,
) {
  try {
    await effect();
    return true;
  } catch (error) {
    logger("push_effect_failed", { stage: "booking_side_effect", ...getSafePushError(error) });
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
    } catch (error) {
      if (isExpiredPushSubscription(error)) {
        dependencies.reportError?.("send", error);
        try {
          await dependencies.removeExpired(subscription.id);
          removed += 1;
        } catch (removeError) {
          dependencies.reportError?.("remove_expired", removeError);
          transientFailure = true;
        }
      } else {
        dependencies.reportError?.("send", error);
        transientFailure = true;
      }
      continue;
    }

    try {
      await dependencies.recordDelivery(subscription.id);
      sent += 1;
    } catch (error) {
      dependencies.reportError?.("record_delivery", error);
      transientFailure = true;
    }
  }

  if (transientFailure) {
    try {
      await dependencies.release();
    } catch (error) {
      dependencies.reportError?.("release", error);
      throw error;
    }
    return { sent, removed, retried: true, outcome: null };
  }

  const outcome = subscriptions.length === removed ? "no_subscriptions" : "delivered";
  try {
    await dependencies.complete(outcome);
  } catch (error) {
    dependencies.reportError?.("complete", error);
    throw error;
  }
  return { sent, removed, retried: false, outcome };
}

export function getAdminPushEnvironmentStatus(): AdminPushEnvironmentStatus {
  return {
    serviceRoleConfigured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    vapidPublicConfigured: Boolean(process.env.VAPID_PUBLIC_KEY),
    vapidPrivateConfigured: Boolean(process.env.VAPID_PRIVATE_KEY),
    vapidSubjectConfigured: Boolean(process.env.VAPID_SUBJECT),
  };
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

export async function dispatchPendingAdminPushes(
  businessSlug: string,
  logger: AdminPushLogger = serverPushLogger,
) {
  const environment = getAdminPushEnvironmentStatus();
  const vapid = getVapidConfiguration();
  if (!vapid) {
    logger("push_configuration_missing", { stage: "configuration", environment });
    return { configured: false, claimed: 0, subscriptions: 0, sent: 0, removed: 0, retried: 0 };
  }

  const supabase = createAdminClient();
  const { data: notifications, error: claimError } = await supabase.rpc(
    "claim_pending_admin_push_notifications",
    { p_business_slug: businessSlug, p_limit: 100 },
  );
  if (claimError) {
    logger("push_claim_failed", { stage: "claim", ...getSafePushError(claimError) });
    throw new Error(`Não foi possível reservar a fila de push: ${claimError.message}`);
  }
  logger("push_claim_completed", {
    stage: "claim",
    notifications: notifications.length,
    claimResult: notifications.length ? "claimed" : "empty",
  });
  if (!notifications.length) return { configured: true, claimed: 0, subscriptions: 0, sent: 0, removed: 0, retried: 0 };

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
    if (subscriptionError) {
      logger("push_subscriptions_failed", {
        stage: "subscriptions",
        notifications: notifications.length,
        ...getSafePushError(subscriptionError),
      });
      throw new Error(`Não foi possível carregar subscriptions: ${subscriptionError.message}`);
    }
    logger("push_subscriptions_loaded", {
      stage: "subscriptions",
      notifications: notifications.length,
      subscriptions: subscriptions.length,
    });

    const notificationIds = notifications.map((notification) => notification.notification_id);
    const subscriptionIds = subscriptions.map((subscription) => subscription.id);
    const deliveryResult = subscriptionIds.length
      ? await supabase
          .from("admin_notification_push_deliveries")
          .select("notification_id, subscription_id")
          .in("notification_id", notificationIds)
          .in("subscription_id", subscriptionIds)
      : { data: [], error: null };
    if (deliveryResult.error) {
      logger("push_delivery_ledger_failed", {
        stage: "delivery_ledger",
        notifications: notifications.length,
        subscriptions: subscriptions.length,
        ...getSafePushError(deliveryResult.error),
      });
      throw new Error(`Não foi possível carregar entregas anteriores: ${deliveryResult.error.message}`);
    }

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
          reportError: (stage, error) => logger("push_delivery_failed", {
            stage,
            notifications: 1,
            subscriptions: recipientSubscriptions.length,
            ...getSafePushError(error),
          }),
        },
      );
      sent += result.sent;
      removed += result.removed;
      if (result.retried) retried += 1;
    }

    const summary = {
      configured: true,
      claimed: notifications.length,
      subscriptions: subscriptions.length,
      sent,
      removed,
      retried,
    };
    logger("push_dispatch_completed", { stage: "complete", ...summary, notifications: summary.claimed });
    return summary;
  } catch (error) {
    await Promise.allSettled(notifications.map(release));
    logger("push_dispatch_failed", {
      stage: "dispatch",
      notifications: notifications.length,
      ...getSafePushError(error),
    });
    throw error;
  }
}
