import assert from "node:assert/strict";
import test from "node:test";
import {
  appointmentsForResource,
  buildDailyCalendarRows,
  calendarResources,
  calendarSlotMinutes,
  isResourceOccupied,
} from "./daily-calendar";
import type {
  AdminAppointment,
  AppointmentSchedulingConfig,
} from "@/types/appointments";

const baseConfig: AppointmentSchedulingConfig = {
  durationMode: "fixed",
  fixedDurationMinutes: 60,
  groups: [],
};

const appointment = (overrides: Partial<AdminAppointment>): AdminAppointment => ({
  id: "appointment-1",
  customerName: "Cliente",
  customerWhatsapp: "5553999999999",
  appointmentDate: "2026-08-24",
  startTime: "08:00",
  endTime: "09:00",
  durationMinutes: 60,
  status: "scheduled",
  source: "admin",
  reminderSentAt: null,
  reminderSentBy: null,
  series: null,
  group1: null,
  group2: null,
  ...overrides,
});

test("usa uma coluna Agenda quando o Grupo 1 não está ativo", () => {
  assert.deepEqual(calendarResources(baseConfig), {
    label: null,
    resources: [{ id: null, name: "Agenda" }],
  });
});

test("mantém opções e ordem configuradas do Grupo 1", () => {
  const result = calendarResources({
    ...baseConfig,
    groups: [
      {
        position: 1,
        label: "Quadra",
        options: [
          { id: "q2", name: "Quadra 2", durationMinutes: null },
          { id: "q1", name: "Quadra 1", durationMinutes: null },
        ],
      },
    ],
  });
  assert.equal(result.label, "Quadra");
  assert.deepEqual(result.resources.map((resource) => resource.id), ["q2", "q1"]);
});

test("mantém uma grade contínua e marca o intervalo fechado", () => {
  const rows = buildDailyCalendarRows(
    [
      { startTime: "08:00", endTime: "11:00" },
      { startTime: "14:00", endTime: "16:00" },
    ],
    60,
    [],
  );
  assert.deepEqual(rows, [
    { time: "08:00", open: true }, { time: "09:00", open: true },
    { time: "10:00", open: true }, { time: "11:00", open: false },
    { time: "12:00", open: false }, { time: "13:00", open: false },
    { time: "14:00", open: true }, { time: "15:00", open: true },
    { time: "16:00", open: false },
  ]);
});

test("inclui o horário real de appointment mesmo fora da cadência base", () => {
  const rows = buildDailyCalendarRows(
    [{ startTime: "08:00", endTime: "11:00" }],
    60,
    [appointment({ startTime: "08:30", endTime: "09:30" })],
  );
  assert.deepEqual(rows.map((row) => row.time), ["08:00", "08:30", "09:00", "10:00", "11:00"]);
});

test("usa o MDC das durações do Grupo 2 na grade", () => {
  assert.equal(
    calendarSlotMinutes({
      durationMode: "group_2",
      fixedDurationMinutes: 60,
      groups: [
        {
          position: 2,
          label: "Atividade",
          options: [
            { id: "a", name: "A", durationMinutes: 45 },
            { id: "b", name: "B", durationMinutes: 60 },
          ],
        },
      ],
    }),
    15,
  );
});

test("filtra appointments pela opção do Grupo 1 e horário", () => {
  const appointments = [
    appointment({ id: "a", group1: { id: "r1", label: "Recurso", name: "1" } }),
    appointment({ id: "b", group1: { id: "r2", label: "Recurso", name: "2" } }),
  ];
  assert.deepEqual(
    appointmentsForResource(appointments, "r2", "08:00").map((item) => item.id),
    ["b"],
  );
  assert.equal(appointmentsForResource(appointments, null, "08:00").length, 2);
});

test("considera toda a duração do appointment como slot ocupado", () => {
  const item = appointment({ startTime: "08:00", endTime: "09:30" });
  assert.equal(isResourceOccupied([item], null, "09:00"), true);
  assert.equal(isResourceOccupied([item], null, "09:30"), false);
});
