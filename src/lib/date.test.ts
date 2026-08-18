import assert from "node:assert/strict";
import test from "node:test";
import { todayInTimeZone } from "./date";

test("resolve hoje no fuso do motor de agendamento", () => {
  const instant = new Date("2026-08-19T01:30:00.000Z");
  assert.equal(todayInTimeZone("America/Sao_Paulo", instant), "2026-08-18");
});
