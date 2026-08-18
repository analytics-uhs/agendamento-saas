import assert from "node:assert/strict";
import test from "node:test";
import { occurrenceNumber, recurrenceSummary, recurrenceWeekday } from "@/lib/recurrence";

test("descreve recorrência permanente e limitada", () => {
  assert.equal(recurrenceSummary("2026-08-24", "18:00", null), "Toda segunda-feira às 18:00 — permanente");
  assert.equal(recurrenceSummary("2026-08-24", "18:00", 12), "Toda segunda-feira às 18:00 — 12 ocorrências");
});

test("calcula o dia e a posição semanal da ocorrência", () => {
  assert.equal(recurrenceWeekday("2026-08-27"), "quinta-feira");
  assert.equal(occurrenceNumber("2026-08-24", "2026-09-14"), 4);
});
