import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAdminPushPayload,
  isExpiredPushSubscription,
  processClaimedPushNotification,
  safelyRunPushEffect,
  type AdminPushSubscription,
} from "./admin-push";

const notification = {
  notificationId: "notification-1",
  claimToken: "claim-1",
  title: "Novo agendamento",
  message: "João agendou Quadra frente para amanhã às 18:00.",
};
const subscriptions: AdminPushSubscription[] = [
  { id: "subscription-1", endpoint: "https://push.example/1", p256dh: "key-1", auth: "auth-1" },
  { id: "subscription-2", endpoint: "https://push.example/2", p256dh: "key-2", auth: "auth-2" },
];

function processingHarness(send: (subscription: AdminPushSubscription) => Promise<void>) {
  const state = { recorded: [] as string[], removed: [] as string[], completed: null as string | null, released: 0 };
  return {
    state,
    dependencies: {
      send: (subscription: AdminPushSubscription) => send(subscription),
      recordDelivery: async (subscriptionId: string) => { state.recorded.push(subscriptionId); },
      removeExpired: async (subscriptionId: string) => { state.removed.push(subscriptionId); },
      complete: async (outcome: "delivered" | "no_subscriptions") => { state.completed = outcome; },
      release: async () => { state.released += 1; },
    },
  };
}

test("payload de push contém somente conteúdo público necessário", () => {
  const payload = JSON.parse(buildAdminPushPayload({
    title: "Novo agendamento",
    message: "João agendou Quadra frente · Futebol para amanhã às 18:00.",
  }));
  assert.deepEqual(payload, {
    title: "Novo agendamento",
    body: "João agendou Quadra frente · Futebol para amanhã às 18:00.",
    icon: "/icon.png",
    badge: "/icon.png",
    url: "/admin",
    tag: "new-public-appointment",
  });
  assert.equal("business_id" in payload, false);
  assert.equal("appointment_id" in payload, false);
  assert.equal("customer_whatsapp" in payload, false);
});

test("subscriptions expiradas ou inválidas são identificadas para remoção", () => {
  assert.equal(isExpiredPushSubscription({ statusCode: 404 }), true);
  assert.equal(isExpiredPushSubscription({ statusCode: 410 }), true);
  assert.equal(isExpiredPushSubscription({ statusCode: 500 }), false);
});

test("falha no efeito secundário de push não rejeita o fluxo principal", async () => {
  const completed = await safelyRunPushEffect(async () => {
    throw new Error("push indisponível");
  });
  assert.equal(completed, false);
});

test("ciclo bem-sucedido registra todos os dispositivos antes de confirmar", async () => {
  const harness = processingHarness(async () => undefined);
  const result = await processClaimedPushNotification(notification, subscriptions, new Set(), harness.dependencies);
  assert.deepEqual(harness.state.recorded, ["subscription-1", "subscription-2"]);
  assert.equal(harness.state.completed, "delivered");
  assert.equal(harness.state.released, 0);
  assert.deepEqual(result, { sent: 2, removed: 0, retried: false, outcome: "delivered" });
});

test("falha transitória libera o claim e preserva entregas já concluídas para retry", async () => {
  const harness = processingHarness(async (subscription) => {
    if (subscription.id === "subscription-2") throw Object.assign(new Error("temporário"), { statusCode: 503 });
  });
  const result = await processClaimedPushNotification(notification, subscriptions, new Set(), harness.dependencies);
  assert.deepEqual(harness.state.recorded, ["subscription-1"]);
  assert.equal(harness.state.completed, null);
  assert.equal(harness.state.released, 1);
  assert.equal(result.retried, true);

  const retry = processingHarness(async () => undefined);
  await processClaimedPushNotification(notification, subscriptions, new Set(["subscription-1"]), retry.dependencies);
  assert.deepEqual(retry.state.recorded, ["subscription-2"]);
  assert.equal(retry.state.completed, "delivered");
});

test("subscription expirada não impede o envio para outro dispositivo válido", async () => {
  const harness = processingHarness(async (subscription) => {
    if (subscription.id === "subscription-1") throw Object.assign(new Error("expirada"), { statusCode: 410 });
  });
  const result = await processClaimedPushNotification(notification, subscriptions, new Set(), harness.dependencies);
  assert.deepEqual(harness.state.removed, ["subscription-1"]);
  assert.deepEqual(harness.state.recorded, ["subscription-2"]);
  assert.equal(harness.state.completed, "delivered");
  assert.deepEqual(result, { sent: 1, removed: 1, retried: false, outcome: "delivered" });
});

test("usuário sem subscription conclui o item explicitamente sem prender o claim", async () => {
  const harness = processingHarness(async () => undefined);
  const result = await processClaimedPushNotification(notification, [], new Set(), harness.dependencies);
  assert.equal(harness.state.completed, "no_subscriptions");
  assert.equal(harness.state.released, 0);
  assert.deepEqual(result, { sent: 0, removed: 0, retried: false, outcome: "no_subscriptions" });
});
