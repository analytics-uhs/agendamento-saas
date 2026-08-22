self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = typeof payload.title === "string" ? payload.title : "Novo agendamento";
  const body = typeof payload.body === "string" ? payload.body : "Você recebeu uma nova notificação.";
  const url = typeof payload.url === "string" && payload.url.startsWith("/admin") ? payload.url : "/admin";

  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: typeof payload.icon === "string" ? payload.icon : "/icon.png",
    badge: typeof payload.badge === "string" ? payload.badge : "/icon.png",
    tag: typeof payload.tag === "string" ? payload.tag : "admin-booking-notification",
    data: { url },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/admin", self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => client.url.startsWith(self.location.origin));
    if (existing) {
      await existing.navigate(targetUrl);
      return existing.focus();
    }
    return self.clients.openWindow(targetUrl);
  })());
});
