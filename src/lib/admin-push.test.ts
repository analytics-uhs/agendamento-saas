import assert from "node:assert/strict";
import test from "node:test";
import { buildAdminPushPayload, isExpiredPushSubscription, safelyRunPushEffect } from "./admin-push";

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
