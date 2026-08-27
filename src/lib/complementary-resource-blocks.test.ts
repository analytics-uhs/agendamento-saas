import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const agenda = readFileSync(new URL("../components/admin/daily-agenda-page.tsx", import.meta.url), "utf8");
const modal = readFileSync(new URL("../components/admin/complementary-block-modal.tsx", import.meta.url), "utf8");
const action = readFileSync(new URL("../app/admin/calendar-block-actions.ts", import.meta.url), "utf8");

test("fluxo legado abre o bloqueio principal diretamente e complemento oferece escolha", () => {
  assert.match(agenda, /config\.complementaryGroup \? setBlockKindOpen\(true\) : setBlockModalOpen\(true\)/);
  assert.match(agenda, /BlockKindModal/);
  assert.match(agenda, /ComplementaryBlockModal/);
});

test("modal complementar representa day sem horários fictícios e time_slot com intervalo", () => {
  assert.match(modal, /occupancyMode === "day" \? null : startTime/);
  assert.match(modal, /occupancyMode === "day" \? null : endTime/);
  assert.match(modal, /O dia inteiro ficará indisponível/);
  assert.match(modal, /id="resource-block-start"/);
  assert.match(modal, /id="resource-block-end"/);
});

test("criação suporta múltiplas opções e recorrência semanal controlada", () => {
  assert.match(modal, /Selecionar todos/);
  assert.match(modal, /Repetir semanalmente/);
  assert.match(action, /createResourceBlocks/);
  assert.match(action, /repeatCount/);
});

test("Agenda diferencia bloqueio complementar e permite abrir seus detalhes", () => {
  assert.match(agenda, /Bloqueado/);
  assert.match(agenda, /ResourceBlockDetails/);
  assert.match(agenda, /setSelectedResourceBlock/);
});
