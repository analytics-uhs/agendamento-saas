import assert from "node:assert/strict";
import test from "node:test";
import { appointmentSourceLabels, appointmentStatusLabels, canTransitionAppointment, manualAppointmentDuration } from "./appointments";

test("mapeia status e origem para labels administrativas", () => {
  assert.deepEqual(appointmentStatusLabels, {
    scheduled: "Agendado", completed: "Concluído", cancelled: "Cancelado", no_show: "Não compareceu",
  });
  assert.equal(appointmentSourceLabels.public, "Página pública");
  assert.equal(appointmentSourceLabels.admin, "Criado no painel");
});

test("permite somente transições a partir de scheduled", () => {
  assert.equal(canTransitionAppointment("scheduled", "completed"), true);
  assert.equal(canTransitionAppointment("scheduled", "cancelled"), true);
  assert.equal(canTransitionAppointment("scheduled", "no_show"), true);
  assert.equal(canTransitionAppointment("cancelled", "completed"), false);
  assert.equal(canTransitionAppointment("completed", "no_show"), false);
  assert.equal(canTransitionAppointment("scheduled", "scheduled"), false);
});

test("calcula duração manual pelos três modos", () => {
  assert.equal(manualAppointmentDuration({ mode: "fixed", fixedDurationMinutes: 60, group2DurationMinutes: null, blocks: 1 }), 60);
  assert.equal(manualAppointmentDuration({ mode: "fixed_multiple", fixedDurationMinutes: 60, group2DurationMinutes: null, blocks: 3 }), 180);
  assert.equal(manualAppointmentDuration({ mode: "group_2", fixedDurationMinutes: 60, group2DurationMinutes: 45, blocks: 1 }), 45);
  assert.equal(manualAppointmentDuration({ mode: "fixed", fixedDurationMinutes: 60, group2DurationMinutes: null, blocks: 2 }), null);
  assert.equal(manualAppointmentDuration({ mode: "group_2", fixedDurationMinutes: 60, group2DurationMinutes: null, blocks: 1 }), null);
});
