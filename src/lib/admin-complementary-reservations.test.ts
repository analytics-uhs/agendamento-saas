import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const modalSource = readFileSync(
  new URL("../components/admin/appointment-form-modal.tsx", import.meta.url),
  "utf8",
);
const agendaSource = readFileSync(
  new URL("../components/admin/daily-agenda-page.tsx", import.meta.url),
  "utf8",
);
const detailsSource = readFileSync(
  new URL("../components/admin/appointment-details.tsx", import.meta.url),
  "utf8",
);
const actionSource = readFileSync(
  new URL("../app/admin/agenda/actions.ts", import.meta.url),
  "utf8",
);

test("modal + Novo preserva o fluxo legado e oferece os três intents somente com complemento", () => {
  assert.match(modalSource, /!editing && complementaryGroup/);
  assert.match(modalSource, /\['primary','Principal'\]/);
  assert.match(modalSource, /\['complementary',complementaryGroup\.intentName\]/);
  assert.match(modalSource, /\['combined',`Principal \+ \$\{complementaryGroup\.intentName\}`\]/);
  assert.match(modalSource, /intent === "primary"/);
});

test("complemento day não pede horário e time_slot mantém início e fim", () => {
  assert.match(modalSource, /occupancyMode === "time_slot" && intent === "complementary"/);
  assert.match(modalSource, /id="complementary-start"/);
  assert.match(modalSource, /id="complementary-end"/);
  assert.match(modalSource, /occupancyMode === "time_slot" \? \(intent === "combined" \? selectedStartTime : complementaryStartTime\) : null/);
  assert.match(modalSource, /occupancyMode === "time_slot" \? \(intent === "combined" \? primaryEndTime : complementaryEndTime\) : null/);
});

test("Agenda separa reservas do dia e complementos por horário sem criar botão paralelo", () => {
  assert.match(agendaSource, />Reservas do dia</);
  assert.match(agendaSource, />Complementos por horário</);
  assert.doesNotMatch(agendaSource, /\+ Complementar/);
  assert.match(agendaSource, /Histórico cancelado/);
});

test("detalhes e cards identificam o componente complementar combinado", () => {
  assert.match(detailsSource, /Complementar · \{appointment\.complementary\.groupName\}/);
  assert.match(agendaSource, /appointment\.complementary\.optionName/);
});

test("Server Action valida a forma do intent antes de chamar a RPC", () => {
  assert.match(actionSource, /const expectedComponents = input\.intent === "combined"/);
  assert.match(actionSource, /input\.primary\.date !== input\.complementary\.date/);
  assert.match(actionSource, /uuid\.test\(input\.complementary\.optionId\)/);
});
