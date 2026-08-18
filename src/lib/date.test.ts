import assert from "node:assert/strict";
import test from "node:test";
import { formatDateTime, todayInTimeZone } from "./date";

test("resolve hoje no fuso do motor de agendamento", () => {
  const instant = new Date("2026-08-19T01:30:00.000Z");
  assert.equal(todayInTimeZone("America/Sao_Paulo", instant), "2026-08-18");
});

test("formata o instante do último lembrete no fuso do produto", () => {
  assert.equal(formatDateTime("2026-08-22T18:30:00.000Z"), "22/08/2026 às 15:30");
});
