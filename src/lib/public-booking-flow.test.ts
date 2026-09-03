import assert from "node:assert/strict";
import test from "node:test";
import { bookingCtaHelper, buildPublicReservationPayload, intentOptions, publicBookingSteps, previousPublicBookingStep, shouldKeepComplementarySelection } from "./public-booking-flow";
import { readFileSync } from "node:fs";
import type { PublicBookingGroup } from "@/types/public-booking";

test("public booking progress adapts to zero, one, or two configured groups", () => {
  assert.deepEqual(publicBookingSteps().map((step) => step.id), ["date", "time", "customer", "review"]);
  assert.deepEqual(publicBookingSteps("Escolha o espaço").map((step) => step.id), ["group_1", "date", "time", "customer", "review"]);
  assert.deepEqual(publicBookingSteps(undefined, "Escolha a atividade").map((step) => step.id), ["group_2", "date", "time", "customer", "review"]);
  assert.deepEqual(publicBookingSteps("Escolha o espaço", "Escolha a atividade").map((step) => step.id), ["group_1", "group_2", "date", "time", "customer", "review"]);
});

const primary: PublicBookingGroup = { position: 1, label: "Quadra", required: true, intentName: null, occupancyMode: null, options: [] };

test("Voltar follows the computed sequence for every intent and optional group", () => {
  for (const intent of ["primary", "combined", "complementary"] as const) {
    for (const mode of ["day", "time_slot"] as const) {
      for (const label of [undefined, "Principal"]) {
        const steps=publicBookingSteps(label, undefined, intent,"Complemento",mode);
        assert.equal(previousPublicBookingStep(steps[0].id,steps),null);
        for (let index=1;index<steps.length;index++) assert.equal(previousPublicBookingStep(steps[index].id,steps),steps[index-1].id);
        assert.equal(previousPublicBookingStep("review",steps),"customer");
        assert.equal(previousPublicBookingStep("customer",steps),intent === "primary" ? "time" : "complementary");
        if (intent!=="complementary" || mode==="time_slot") assert.equal(previousPublicBookingStep("time",steps),"date");
        assert.equal(previousPublicBookingStep(steps[1].id,steps),"intent");
      }
    }
  }
  assert.equal(previousPublicBookingStep("date",publicBookingSteps()),null);
  assert.equal(previousPublicBookingStep("intent",publicBookingSteps()),null);
});

test("BookingFlow summaries are passive and Back preserves selections rather than resetting", () => {
  const source=readFileSync("src/components/booking/booking-flow.tsx","utf8");
  const completed=source.slice(source.indexOf("function CompletedStep"),source.indexOf("function FlowProgress"));
  assert.doesNotMatch(completed,/button|onEdit|onClick|Alterar|Editar|Trocar/);
  const back=source.slice(source.indexOf("function goBack"),source.indexOf("function nextAfter"));
  assert.match(back,/setActiveStep\(previousStep\)/);
  assert.doesNotMatch(back,/resetSchedule|setBlocks|setTime|setGroup|setDate|setComplementary/);
  assert.match(source,/previousStep \? <Button/);
  assert.match(source,/onSelect=\{chooseDate\}/);
  assert.match(source,/const changed = optionId !== group1/);
  assert.match(source,/resetSchedule\(true\)/);
  assert.match(source,/setDate\(selectedDate\); setTime\(null\); setBlocks\(1\)/);
  assert.match(source,/activeStep !== "review"/);
});

test("start order reorders only date and active primary groups, including previous/progress", () => {
  const ids = (...args: Parameters<typeof publicBookingSteps>) => publicBookingSteps(...args).map((step) => step.id);
  assert.deepEqual(ids("Principal"), ["group_1", "date", "time", "customer", "review"]);
  assert.deepEqual(ids("Principal", undefined, "primary", undefined, null, "date_first"), ["date", "group_1", "time", "customer", "review"]);
  assert.deepEqual(ids("Principal", "Secundário", "primary", undefined, null, "date_first"), ["date", "group_1", "group_2", "time", "customer", "review"]);
  assert.deepEqual(ids(undefined, "Secundário", "primary", undefined, null, "date_first"), ["date", "group_2", "time", "customer", "review"]);
  assert.deepEqual(ids(undefined, undefined, "primary", undefined, null, "date_first"), ["date", "time", "customer", "review"]);
  for (const order of ["service_first", "date_first"] as const) {
    for (const mode of ["day", "time_slot"] as const) {
      assert.deepEqual(ids("Principal", "Secundário", null, "Complemento", mode, order), ["intent"]);
      assert.deepEqual(ids("Principal", "Secundário", "complementary", "Complemento", mode, order), ["intent", "date", ...(mode === "time_slot" ? ["time"] : []), "complementary", "customer", "review"]);
      const combined = publicBookingSteps("Principal", "Secundário", "combined", "Complemento", mode, order);
      assert.deepEqual(combined.map((step) => step.id), ["intent", ...(order === "date_first" ? ["date", "group_1", "group_2"] : ["group_1", "group_2", "date"]), "time", "complementary", "customer", "review"]);
      for (let index = 1; index < combined.length; index++) assert.equal(previousPublicBookingStep(combined[index].id, combined), combined[index - 1].id);
    }
  }
});

test("date-first integration delays availability and preserves independent choices", () => {
  const source = readFileSync("src/components/booking/booking-flow.tsx", "utf8");
  assert.match(source, /publicBookingSteps\([^\n]+startOrder\)/);
  assert.match(source, /if \(includesPrimary && \(\(groupOne && !primaryId\) \|\| \(groupTwo && !secondaryId\)\)\) return/);
  assert.match(source, /group1OptionId: primaryId, group2OptionId: secondaryId/);
  assert.match(source, /advanceSelection\("group_1", optionId/);
  assert.match(source, /advanceSelection\("group_2", group1, optionId/);
  assert.match(source, /if \(!keepDate\) setDate\(null\)/);
  const dateHandler = source.slice(source.indexOf("function chooseDate"), source.indexOf("const canContinue"));
  assert.doesNotMatch(dateHandler, /setGroup1|setGroup2/);
  assert.match(source, /option.availableWeekdays \?\? businessWeekdays/);
  assert.match(source, /selectFixedMultipleSlot\(slots, time, blocks, slot.startTime\)/);
});
const complementaryDay: PublicBookingGroup = { position: 3, label: "Escolha o apoio", required: false, intentName: "Churrasqueira", occupancyMode: "day", options: [] };

test("negócio com complemento começa pela intenção e adapta os passos", () => {
  assert.deepEqual(publicBookingSteps("Quadra", "Esporte", null, "Churrasqueira", "day").map((step) => step.id), ["intent"]);
  assert.deepEqual(publicBookingSteps("Quadra", "Esporte", "primary", "Churrasqueira", "day").map((step) => step.id), ["intent", "group_1", "group_2", "date", "time", "customer", "review"]);
  assert.deepEqual(publicBookingSteps("Quadra", "Esporte", "complementary", "Churrasqueira", "day").map((step) => step.id), ["intent", "date", "complementary", "customer", "review"]);
  assert.deepEqual(publicBookingSteps("Quadra", "Esporte", "complementary", "Churrasqueira", "time_slot").map((step) => step.id), ["intent", "date", "time", "complementary", "customer", "review"]);
  assert.deepEqual(publicBookingSteps("Quadra", "Esporte", "combined", "Churrasqueira", "day").map((step) => step.id), ["intent", "group_1", "group_2", "date", "time", "complementary", "customer", "review"]);
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
