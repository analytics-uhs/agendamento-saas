import assert from "node:assert/strict";
import test from "node:test";
import { consecutiveSelectionTimes, selectFixedMultipleSlot } from "./fixed-multiple-selection";

const slots = ["08:00", "08:30", "09:00", "09:30", "10:00"].map((startTime, index) => ({ startTime, durationMinutes: 30, maxBlocks: index === 0 ? 3 : 1 }));

test("seleciona e remove somente blocos consecutivos", () => {
  assert.deepEqual(selectFixedMultipleSlot(slots, null, 1, "08:00"), { startTime: "08:00", blocks: 1, rejected: false });
  assert.deepEqual(selectFixedMultipleSlot(slots, "08:00", 1, "08:30"), { startTime: "08:00", blocks: 2, rejected: false });
  assert.deepEqual(selectFixedMultipleSlot(slots, "08:00", 2, "09:00"), { startTime: "08:00", blocks: 3, rejected: false });
  assert.deepEqual(selectFixedMultipleSlot(slots, "08:00", 2, "08:30"), { startTime: "08:00", blocks: 1, rejected: false });
});

test("rejeita lacunas e respeita maxBlocks", () => {
  assert.deepEqual(selectFixedMultipleSlot(slots, "08:00", 2, "10:00"), { startTime: "08:00", blocks: 2, rejected: true });
  assert.deepEqual(selectFixedMultipleSlot(slots, "08:00", 3, "09:30"), { startTime: "08:00", blocks: 3, rejected: true });
  assert.deepEqual(consecutiveSelectionTimes(slots, "08:00", 3), ["08:00", "08:30", "09:00"]);
});

test("não atravessa intervalo fechado sem o próximo slot disponível", () => {
  const splitWindowSlots = [
    { startTime: "08:00", durationMinutes: 30, maxBlocks: 2 },
    { startTime: "08:30", durationMinutes: 30, maxBlocks: 1 },
    { startTime: "10:00", durationMinutes: 30, maxBlocks: 2 },
  ];
  assert.deepEqual(selectFixedMultipleSlot(splitWindowSlots, "08:00", 2, "10:00"), {
    startTime: "08:00", blocks: 2, rejected: true,
  });
});
