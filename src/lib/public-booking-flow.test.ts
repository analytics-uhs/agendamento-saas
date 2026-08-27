import assert from "node:assert/strict";
import test from "node:test";
import { bookingCtaHelper, buildPublicReservationPayload, intentOptions, publicBookingSteps, shouldKeepComplementarySelection } from "./public-booking-flow";
import type { PublicBookingGroup } from "@/types/public-booking";

test("public booking progress adapts to zero, one, or two configured groups", () => {
  assert.deepEqual(publicBookingSteps().map((step) => step.id), ["date", "time", "customer"]);
  assert.deepEqual(publicBookingSteps("Escolha o espaço").map((step) => step.id), ["group_1", "date", "time", "customer"]);
  assert.deepEqual(publicBookingSteps(undefined, "Escolha a atividade").map((step) => step.id), ["group_2", "date", "time", "customer"]);
  assert.deepEqual(publicBookingSteps("Escolha o espaço", "Escolha a atividade").map((step) => step.id), ["group_1", "group_2", "date", "time", "customer"]);
});

const primary: PublicBookingGroup = { position: 1, label: "Quadra", required: true, intentName: null, occupancyMode: null, options: [] };
const complementaryDay: PublicBookingGroup = { position: 3, label: "Escolha o apoio", required: false, intentName: "Churrasqueira", occupancyMode: "day", options: [] };

test("negócio com complemento começa pela intenção e adapta os passos", () => {
  assert.deepEqual(publicBookingSteps("Quadra", "Esporte", null, "Churrasqueira", "day").map((step) => step.id), ["intent"]);
  assert.deepEqual(publicBookingSteps("Quadra", "Esporte", "primary", "Churrasqueira", "day").map((step) => step.id), ["intent", "group_1", "group_2", "date", "time", "customer"]);
  assert.deepEqual(publicBookingSteps("Quadra", "Esporte", "complementary", "Churrasqueira", "day").map((step) => step.id), ["intent", "date", "complementary", "customer"]);
  assert.deepEqual(publicBookingSteps("Quadra", "Esporte", "complementary", "Churrasqueira", "time_slot").map((step) => step.id), ["intent", "date", "time", "complementary", "customer"]);
  assert.deepEqual(publicBookingSteps("Quadra", "Esporte", "combined", "Churrasqueira", "day").map((step) => step.id), ["intent", "group_1", "group_2", "date", "time", "complementary", "customer"]);
});

test("seletor usa nomes configurados e não terminologia técnica", () => {
  assert.deepEqual(intentOptions(primary, complementaryDay).map((item) => item.name), ["Quadra", "Churrasqueira", "Quadra + churrasqueira"]);
});

test("payload transacional representa principal, complemento day e combinação time_slot", () => {
  const base = { group1OptionId: "10000000-0000-4000-8000-000000000001", group2OptionId: null, complementaryOptionId: "20000000-0000-4000-8000-000000000001", date: "2026-09-01", startTime: "10:00", endTime: "11:00", blocks: 1, customerName: " João ", customerWhatsapp: "53999999999" };
  const principal = buildPublicReservationPayload({ ...base, intent: "primary", occupancyMode: "day" });
  assert.ok(principal.primary); assert.equal(principal.complementary, undefined);
  const day = buildPublicReservationPayload({ ...base, intent: "complementary", occupancyMode: "day", startTime: null, endTime: null });
  assert.equal(day.primary, undefined); assert.deepEqual(day.complementary, { option_id: base.complementaryOptionId, occupancy_mode: "day", date: base.date });
  const combined = buildPublicReservationPayload({ ...base, intent: "combined", occupancyMode: "time_slot" });
  assert.ok(combined.primary); assert.deepEqual(combined.complementary, { option_id: base.complementaryOptionId, occupancy_mode: "time_slot", date: base.date, start_time: "10:00", end_time: "11:00" });
});

test("alterações invalidam apenas seleções complementares dependentes", () => {
  assert.equal(shouldKeepComplementarySelection({ occupancyMode: "day", dateChanged: false, timeChanged: true }), true);
  assert.equal(shouldKeepComplementarySelection({ occupancyMode: "time_slot", dateChanged: false, timeChanged: true }), false);
  assert.equal(shouldKeepComplementarySelection({ occupancyMode: "day", dateChanged: true, timeChanged: false }), false);
});

test("CTA helper points to the first missing part of the flow", () => {
  const ready = { groupOneMissing: false, groupTwoMissing: false, dateMissing: false, timeMissing: false, customerMissing: false, whatsappMissing: false };
  assert.equal(bookingCtaHelper({ ...ready, groupOneMissing: true }), "Conclua as escolhas acima para continuar.");
  assert.equal(bookingCtaHelper({ ...ready, dateMissing: true }), "Escolha uma data para continuar.");
  assert.equal(bookingCtaHelper({ ...ready, timeMissing: true }), "Escolha um horário para continuar.");
  assert.equal(bookingCtaHelper({ ...ready, complementaryMissing: true }), "Escolha uma opção complementar para continuar.");
  assert.equal(bookingCtaHelper({ ...ready, customerMissing: true }), "Informe seu nome e WhatsApp para confirmar.");
  assert.equal(bookingCtaHelper(ready), "Revise os dados e confirme seu agendamento.");
});
