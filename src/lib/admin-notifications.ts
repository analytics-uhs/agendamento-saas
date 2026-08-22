import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { AdminNotification } from "@/types/admin-notifications";
import type { Database } from "@/types/database";

export type AdminNotificationRealtimeStatus = "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED";

type AdminNotificationRealtimeOptions = {
  onStatus?: (status: AdminNotificationRealtimeStatus) => void;
  onReconnect?: () => void;
};

type AdminNotificationRow = Pick<
  Database["public"]["Tables"]["admin_notifications"]["Row"],
  "id" | "business_id" | "user_id" | "type" | "title" | "message" | "appointment_id" | "read_at" | "created_at"
>;

export function mapAdminNotification(row: AdminNotificationRow): AdminNotification {
  return {
    id: row.id,
    businessId: row.business_id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    message: row.message,
    appointmentId: row.appointment_id,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

export function mergeAdminNotification(items: AdminNotification[], incoming: AdminNotification, limit = 20) {
  return [incoming, ...items.filter((item) => item.id !== incoming.id)]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit);
}

export function reconcileAdminNotificationFeed(
  current: AdminNotification[],
  recovered: AdminNotification[],
  limit = 20,
) {
  return [...recovered, ...current.filter((item) => !recovered.some((recoveredItem) => recoveredItem.id === item.id))]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit);
}

export function relativeNotificationTime(value: string, now = new Date()) {
  const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - new Date(value).getTime()) / 1000));
  if (elapsedSeconds < 60) return "agora";
  const minutes = Math.floor(elapsedSeconds / 60);
  if (minutes < 60) return `há ${minutes} ${minutes === 1 ? "minuto" : "minutos"}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} ${hours === 1 ? "hora" : "horas"}`;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

export function subscribeToAdminNotificationInserts(
  supabase: SupabaseClient<Database>,
  userId: string,
  onInsert: (notification: AdminNotification) => void,
  options: AdminNotificationRealtimeOptions = {},
) {
  let disposed = false;
  let connectionInterrupted = false;
  const channel: RealtimeChannel = supabase
    .channel(`admin-notifications:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "admin_notifications",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => onInsert(mapAdminNotification(payload.new as Database["public"]["Tables"]["admin_notifications"]["Row"])),
    )
    .subscribe((status) => {
      if (disposed) return;
      const knownStatus = status as AdminNotificationRealtimeStatus;
      options.onStatus?.(knownStatus);

      if (process.env.NODE_ENV === "development") {
        const log = knownStatus === "SUBSCRIBED" ? console.info : console.warn;
        log("[admin-notifications] Realtime channel status", { status: knownStatus });
      }

      if (knownStatus === "SUBSCRIBED") {
        if (connectionInterrupted) options.onReconnect?.();
        connectionInterrupted = false;
        return;
      }

      if (knownStatus === "CHANNEL_ERROR" || knownStatus === "TIMED_OUT" || knownStatus === "CLOSED") {
        connectionInterrupted = true;
      }
    });

  return () => {
    disposed = true;
    void supabase.removeChannel(channel);
  };
}

export function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const decoded = window.atob(base64);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}
