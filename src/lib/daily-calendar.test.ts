import assert from "node:assert/strict";
import test from "node:test";
import {
  calendarResources,
  calendarSlotMinutes,
} from "./daily-calendar";
import type {
  AppointmentSchedulingConfig,
} from "@/types/appointments";

const baseConfig: AppointmentSchedulingConfig = {
  durationMode: "fixed",
  fixedDurationMinutes: 60,
  groups: [],
};

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
