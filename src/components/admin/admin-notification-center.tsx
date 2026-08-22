"use client";

import { Bell, BellOff, BellRing, CheckCheck, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import {
  readAdminNotification,
  readAllAdminNotifications,
  registerAdminPushSubscription,
  unregisterAdminPushSubscription,
} from "@/app/admin/notification-actions";
import {
  mergeAdminNotification,
  relativeNotificationTime,
  subscribeToAdminNotificationInserts,
  urlBase64ToUint8Array,
} from "@/lib/admin-notifications";
import { classes } from "@/lib/classes";
import { createClient } from "@/lib/supabase/client";
import type { AdminNotification, AdminNotificationFeed } from "@/types/admin-notifications";

type PushState = "unsupported" | "default" | "denied" | "active" | "inactive";

export function useAdminNotificationCenter({
  initialFeed,
  userId,
  vapidPublicKey,
}: {
  initialFeed: AdminNotificationFeed;
  userId: string;
  vapidPublicKey: string | null;
}) {
  const [items, setItems] = useState(initialFeed.items);
  const [unreadCount, setUnreadCount] = useState(initialFeed.unreadCount);
  const [open, setOpen] = useState(false);
  const [pushState, setPushState] = useState<PushState>("default");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => subscribeToAdminNotificationInserts(createClient(), userId, (notification) => {
    setItems((current) => mergeAdminNotification(current, notification));
    if (!notification.readAt) setUnreadCount((current) => current + 1);
  }), [userId]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        setPushState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setPushState("denied");
        return;
      }
      if (Notification.permission !== "granted") {
        setPushState("default");
        return;
      }
      void navigator.serviceWorker.getRegistration("/push-sw.js").then(async (registration) => {
        const subscription = await registration?.pushManager.getSubscription();
        setPushState(subscription ? "active" : "inactive");
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const markRead = useCallback((notification: AdminNotification) => {
    if (notification.readAt) return;
    const readAt = new Date().toISOString();
    setItems((current) => current.map((item) => item.id === notification.id ? { ...item, readAt } : item));
    setUnreadCount((current) => Math.max(0, current - 1));
    startTransition(async () => {
      const result = await readAdminNotification(notification.id);
      if (!result.ok) {
        setItems((current) => current.map((item) => item.id === notification.id ? { ...item, readAt: null } : item));
        setUnreadCount((current) => current + 1);
        setFeedback(result.message);
      }
    });
  }, []);

  const markAllRead = useCallback(() => {
    const previous = items;
    const readAt = new Date().toISOString();
    setItems((current) => current.map((item) => item.readAt ? item : { ...item, readAt }));
    setUnreadCount(0);
    startTransition(async () => {
      const result = await readAllAdminNotifications();
      if (!result.ok) {
        setItems(previous);
        setUnreadCount(previous.filter((item) => !item.readAt).length);
        setFeedback(result.message);
      }
    });
  }, [items]);

  const activatePush = useCallback(() => {
    if (!vapidPublicKey) {
      setFeedback("Web Push ainda não está configurado neste ambiente.");
      return;
    }
    startTransition(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission === "denied") {
          setPushState("denied");
          return;
        }
        if (permission !== "granted") return;
        const registration = await navigator.serviceWorker.register("/push-sw.js", { scope: "/" });
        const current = await registration.pushManager.getSubscription();
        const subscription = current ?? await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });
        const serialized = subscription.toJSON();
        const p256dh = serialized.keys?.p256dh;
        const auth = serialized.keys?.auth;
        if (!serialized.endpoint || !p256dh || !auth) throw new Error("Subscription incompleta");
        const result = await registerAdminPushSubscription({
          endpoint: serialized.endpoint,
          p256dh,
          auth,
          userAgent: navigator.userAgent,
        });
        if (!result.ok) throw new Error(result.message);
        setPushState("active");
        setFeedback(result.message);
      } catch {
        setPushState(Notification.permission === "denied" ? "denied" : "inactive");
        setFeedback("Não foi possível ativar as notificações neste dispositivo.");
      }
    });
  }, [vapidPublicKey]);

  const deactivatePush = useCallback(() => {
    startTransition(async () => {
      const registration = await navigator.serviceWorker.getRegistration("/push-sw.js");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const result = await unregisterAdminPushSubscription(subscription.endpoint);
        if (!result.ok) {
          setFeedback(result.message);
          return;
        }
        await subscription.unsubscribe();
      }
      setPushState("inactive");
      setFeedback("Notificações desativadas neste dispositivo.");
    });
  }, []);

  return {
    items,
    unreadCount,
    open,
    setOpen,
    pushState,
    feedback,
    pending,
    markRead,
    markAllRead,
    activatePush,
    deactivatePush,
  };
}

type NotificationCenter = ReturnType<typeof useAdminNotificationCenter>;

export function AdminNotificationBell({ center, placement }: { center: NotificationCenter; placement: "desktop" | "mobile" }) {
  const { unreadCount } = center;
  return (
    <div className={classes(placement === "desktop" ? "hidden lg:block" : "lg:hidden")}>
      <button
        type="button"
        aria-label={unreadCount ? `Notificações, ${unreadCount} não lidas` : "Notificações"}
        aria-expanded={center.open}
        onClick={() => center.setOpen(!center.open)}
        className="focus-ring relative rounded-lg border p-2 text-muted hover:bg-surface hover:text-foreground"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 ? <span className="absolute -right-1.5 -top-1.5 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold leading-none text-white">{unreadCount > 99 ? "99+" : unreadCount}</span> : null}
      </button>
      {center.open ? <AdminNotificationPanel center={center} /> : null}
    </div>
  );
}

function AdminNotificationPanel({ center }: { center: NotificationCenter }) {
  return (
    <section className="fixed inset-x-3 top-16 z-50 max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-2xl border bg-background shadow-2xl lg:left-4 lg:right-auto lg:w-[370px]" aria-label="Central de notificações">
      <header className="sticky top-0 flex items-center justify-between gap-3 border-b bg-background px-4 py-3">
        <div><h2 className="font-semibold">Notificações</h2><p className="text-xs text-muted">{center.unreadCount ? `${center.unreadCount} não ${center.unreadCount === 1 ? "lida" : "lidas"}` : "Tudo em dia"}</p></div>
        {center.unreadCount ? <button type="button" disabled={center.pending} onClick={center.markAllRead} className="focus-ring flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-primary hover:bg-primary/10"><CheckCheck className="h-3.5 w-3.5" />Marcar todas</button> : null}
      </header>
      <div className="border-b p-3">
        {center.pushState === "active" ? <div className="flex items-center justify-between gap-3 rounded-xl bg-primary/10 px-3 py-2"><span className="flex items-center gap-2 text-xs font-medium text-primary"><BellRing className="h-4 w-4" />Notificações ativas</span><button type="button" disabled={center.pending} onClick={center.deactivatePush} className="text-xs text-muted underline underline-offset-2">Desativar</button></div> : null}
        {center.pushState === "default" || center.pushState === "inactive" ? <button type="button" disabled={center.pending} onClick={center.activatePush} className="focus-ring flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium hover:bg-surface">{center.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}Ativar notificações</button> : null}
        {center.pushState === "denied" ? <p className="flex items-start gap-2 rounded-xl bg-surface px-3 py-2 text-xs text-muted"><BellOff className="mt-0.5 h-4 w-4 shrink-0" />Permissão bloqueada. Libere as notificações nas configurações do navegador.</p> : null}
        {center.pushState === "unsupported" ? <p className="text-xs text-muted">Este navegador não oferece suporte a Web Push.</p> : null}
        {center.feedback ? <p role="status" className="mt-2 text-xs text-muted">{center.feedback}</p> : null}
      </div>
      <div className="divide-y">
        {center.items.length ? center.items.map((notification) => (
          <button key={notification.id} type="button" onClick={() => center.markRead(notification)} className={classes("focus-ring block w-full px-4 py-3 text-left hover:bg-surface", !notification.readAt && "bg-primary/5")}>
            <span className="flex items-start justify-between gap-3"><strong className="text-sm">{notification.title}</strong>{!notification.readAt ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Não lida" /> : null}</span>
            <span className="mt-1 block text-sm leading-relaxed text-muted">{notification.message}</span>
            <span className="mt-1.5 block text-xs text-muted">{relativeNotificationTime(notification.createdAt)}</span>
          </button>
        )) : <div className="px-4 py-10 text-center"><Bell className="mx-auto h-6 w-6 text-muted" /><p className="mt-2 text-sm font-medium">Nenhuma notificação</p><p className="mt-1 text-xs text-muted">Novos agendamentos aparecerão aqui.</p></div>}
      </div>
    </section>
  );
}
