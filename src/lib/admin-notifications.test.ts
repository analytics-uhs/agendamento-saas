import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isOutsideAdminNotificationPopover,
  mapAdminNotification,
  mergeAdminNotification,
  reconcileAdminNotificationFeed,
  relativeNotificationTime,
  subscribeToAdminNotificationInserts,
} from "./admin-notifications";
import type { Database } from "../types/database";

const row: Database["public"]["Tables"]["admin_notifications"]["Row"] = {
  id: "notification-1",
  business_id: "business-1",
  user_id: "user-1",
  type: "new_public_appointment",
  title: "Novo agendamento",
  message: "João agendou Quadra frente para amanhã às 18:00.",
  appointment_id: "appointment-1",
  reservation_resource_id: null,
  read_at: null,
  push_dispatched_at: null,
  push_claimed_at: null,
  push_claim_token: null,
  push_delivery_status: null,
  created_at: "2026-08-22T12:00:00.000Z",
};

test("novo insert do Realtime entra no topo sem duplicar e atualiza o estado não lido", () => {
  const existing = mapAdminNotification({ ...row, id: "notification-0", created_at: "2026-08-22T11:00:00.000Z" });
  const incoming = mapAdminNotification(row);
  const merged = mergeAdminNotification([existing, incoming], incoming);
  assert.deepEqual(merged.map((item) => item.id), ["notification-1", "notification-0"]);
  assert.equal(merged.filter((item) => !item.readAt).length, 2);
});

test("reconciliação do feed não duplica notificações recebidas durante a retomada", () => {
  const existing = mapAdminNotification({ ...row, id: "notification-0", created_at: "2026-08-22T11:00:00.000Z" });
  const incoming = mapAdminNotification(row);
  const reconciled = reconcileAdminNotificationFeed([incoming, existing], [incoming]);
  assert.deepEqual(reconciled.map((item) => item.id), ["notification-1", "notification-0"]);
});

test("formata horário relativo das notificações", () => {
  const now = new Date("2026-08-22T12:02:00.000Z");
  assert.equal(relativeNotificationTime(row.created_at, now), "há 2 minutos");
});

test("clique dentro do sino ou painel não é externo, mas clique fora é", () => {
  const desktop = { contains: (target: string) => target === "desktop-button" || target === "desktop-panel" };
  const mobile = { contains: (target: string) => target === "mobile-button" || target === "mobile-panel" };
  assert.equal(isOutsideAdminNotificationPopover("desktop-button", [desktop, mobile]), false);
  assert.equal(isOutsideAdminNotificationPopover("mobile-panel", [desktop, mobile]), false);
  assert.equal(isOutsideAdminNotificationPopover("page-content", [desktop, mobile]), true);
});

test("detecção de clique externo tolera containers ainda não montados", () => {
  const mobile = { contains: (target: string) => target === "mobile-panel" };
  assert.equal(isOutsideAdminNotificationPopover("mobile-panel", [null, mobile]), false);
  assert.equal(isOutsideAdminNotificationPopover("page-content", [null, mobile]), true);
});

test("subscription Realtime filtra pelo usuário e remove o canal no cleanup", async () => {
  let filter = "";
  let insertHandler: ((payload: { new: typeof row }) => void) | null = null;
  let statusHandler: ((status: "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED") => void) | null = null;
  let removed = false;
  const channel = {
    on: (_event: string, config: { filter: string }, handler: (payload: { new: typeof row }) => void) => {
      filter = config.filter;
      insertHandler = handler;
      return channel;
    },
    subscribe: (handler: typeof statusHandler) => {
      statusHandler = handler;
      return channel;
    },
  };
  const fake = {
    channel: () => channel,
    removeChannel: async () => { removed = true; return "ok"; },
  } as unknown as SupabaseClient<Database>;
  const received: string[] = [];
  const statuses: string[] = [];
  let reconnects = 0;

  const cleanup = subscribeToAdminNotificationInserts(
    fake,
    "user-1",
    (notification) => received.push(notification.id),
    { onStatus: (status) => statuses.push(status), onReconnect: () => { reconnects += 1; } },
  );
  assert.equal(filter, "user_id=eq.user-1");
  assert.ok(insertHandler);
  assert.ok(statusHandler);
  (statusHandler as (status: "SUBSCRIBED") => void)("SUBSCRIBED");
  (insertHandler as (payload: { new: typeof row }) => void)({ new: row });
  assert.deepEqual(received, ["notification-1"]);
  assert.deepEqual(statuses, ["SUBSCRIBED"]);

  (statusHandler as (status: "CHANNEL_ERROR") => void)("CHANNEL_ERROR");
  (statusHandler as (status: "TIMED_OUT") => void)("TIMED_OUT");
  (statusHandler as (status: "CLOSED") => void)("CLOSED");
  (statusHandler as (status: "SUBSCRIBED") => void)("SUBSCRIBED");
  (statusHandler as (status: "SUBSCRIBED") => void)("SUBSCRIBED");
  assert.equal(reconnects, 1);
  assert.deepEqual(statuses, ["SUBSCRIBED", "CHANNEL_ERROR", "TIMED_OUT", "CLOSED", "SUBSCRIBED", "SUBSCRIBED"]);

  cleanup();
  (statusHandler as (status: "CLOSED") => void)("CLOSED");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(removed, true);
  assert.equal(reconnects, 1);
});
