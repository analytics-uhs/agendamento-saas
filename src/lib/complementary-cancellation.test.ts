import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const details = readFileSync(new URL("../components/admin/complementary-reservation-details.tsx", import.meta.url), "utf8");
const appointment = readFileSync(new URL("../components/admin/appointment-details.tsx", import.meta.url), "utf8");
const management = readFileSync(new URL("../components/admin/use-appointment-management.ts", import.meta.url), "utf8");
const agenda = readFileSync(new URL("../components/admin/daily-agenda-page.tsx", import.meta.url), "utf8");
const publicAction = readFileSync(new URL("../app/agendar/[slug]/actions.ts", import.meta.url), "utf8");

test("detalhe complementary-only preserva dados e confirmação destrutiva contextual", () => {
  assert.match(details, /Detalhes da reserva/);
  assert.match(details, /Reserva do dia/);
  assert.match(details, /Cancelar \{reservation\.optionName\}\?/);
  assert.match(details, /Cancelar reserva/);
});

test("reserva combinada separa cancelamento complementar e completo", () => {
  assert.match(appointment, /Ações da reserva combinada/);
  assert.match(appointment, /Cancelar \{appointment\.complementary\.optionName\}/);
  assert.match(appointment, /Cancelar reserva completa/);
});

test("cancelamento principal explica que o complemento permanece ativo", () => {
  assert.match(management, /A reserva de \$\{appointment\.complementary\.optionName\} permanecerá ativa/);
});

test("Agenda abre detalhes das reservas day e time_slot e aplica atualização sem reload", () => {
  assert.match(agenda, /setSelectedComplementary/);
  assert.match(agenda, /ComplementaryReservationDetails/);
  assert.match(agenda, /applyCalendar\(result\.data\)/);
});

test("efeito de Web Push permanece posterior à criação transacional pública", () => {
  assert.match(publicAction, /dispatchPendingAdminPushes\(input\.slug\)/);
  assert.match(publicAction, /safelyRunPushEffect/);
});
