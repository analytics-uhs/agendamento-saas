import assert from "node:assert/strict";
import test from "node:test";
import { bookingCtaHelper, publicBookingSteps } from "./public-booking-flow";

test("public booking progress adapts to zero, one, or two configured groups", () => {
  assert.deepEqual(publicBookingSteps().map((step) => step.id), ["date", "time", "customer"]);
  assert.deepEqual(publicBookingSteps("Escolha o espaço").map((step) => step.id), ["group_1", "date", "time", "customer"]);
  assert.deepEqual(publicBookingSteps(undefined, "Escolha a atividade").map((step) => step.id), ["group_2", "date", "time", "customer"]);
  assert.deepEqual(publicBookingSteps("Escolha o espaço", "Escolha a atividade").map((step) => step.id), ["group_1", "group_2", "date", "time", "customer"]);
});

test("CTA helper points to the first missing part of the flow", () => {
  const ready = { groupOneMissing: false, groupTwoMissing: false, dateMissing: false, timeMissing: false, customerMissing: false, whatsappMissing: false };
  assert.equal(bookingCtaHelper({ ...ready, groupOneMissing: true }), "Conclua as escolhas acima para continuar.");
  assert.equal(bookingCtaHelper({ ...ready, dateMissing: true }), "Escolha uma data para continuar.");
  assert.equal(bookingCtaHelper({ ...ready, timeMissing: true }), "Escolha um horário para continuar.");
  assert.equal(bookingCtaHelper({ ...ready, customerMissing: true }), "Informe seu nome e WhatsApp para confirmar.");
  assert.equal(bookingCtaHelper(ready), "Revise os dados e confirme seu agendamento.");
});
