"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { requireCurrentBusiness } from "@/lib/repositories/businesses";
import {
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
  removePushSubscription,
  savePushSubscription,
} from "@/lib/repositories/admin-notifications";
import type { BrowserPushSubscriptionInput } from "@/types/admin-notifications";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type NotificationActionResult = { ok: boolean; message: string; readAt?: string };

export async function readAdminNotification(notificationId: string): Promise<NotificationActionResult> {
  if (!uuid.test(notificationId)) return { ok: false, message: "Notificação inválida." };
  await requireAuthenticatedUser();
  const { data, error } = await markAdminNotificationRead(notificationId);
  if (error || !data) return { ok: false, message: "Não foi possível marcar a notificação como lida." };
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Notificação lida.", readAt: data };
}

export async function readAllAdminNotifications(): Promise<NotificationActionResult> {
  const business = await requireCurrentBusiness();
  const { error } = await markAllAdminNotificationsRead(business.id);
  if (error) return { ok: false, message: "Não foi possível marcar as notificações como lidas." };
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Todas as notificações foram marcadas como lidas." };
}

export async function registerAdminPushSubscription(
  subscription: BrowserPushSubscriptionInput,
): Promise<NotificationActionResult> {
  const business = await requireCurrentBusiness();
  if (
    !subscription.endpoint.startsWith("https://")
    || subscription.endpoint.length > 2048
    || subscription.p256dh.length < 16
    || subscription.auth.length < 8
  ) return { ok: false, message: "Subscription de notificação inválida." };

  const { error } = await savePushSubscription(business.id, subscription);
  if (error) return { ok: false, message: "Não foi possível ativar as notificações neste dispositivo." };
  return { ok: true, message: "Notificações ativas neste dispositivo." };
}

export async function unregisterAdminPushSubscription(endpoint: string): Promise<NotificationActionResult> {
  if (!endpoint.startsWith("https://") || endpoint.length > 2048) {
    return { ok: false, message: "Subscription de notificação inválida." };
  }
  await requireAuthenticatedUser();
  const { error } = await removePushSubscription(endpoint);
  if (error) return { ok: false, message: "Não foi possível desativar as notificações neste dispositivo." };
  return { ok: true, message: "Notificações desativadas neste dispositivo." };
}
