import assert from "node:assert/strict";
import test from "node:test";
import { consecutiveSelectionTimes, selectFixedMultipleSlot } from "./fixed-multiple-selection";

const slots = ["08:00", "08:30", "09:00", "10:00"].map((startTime, index) => ({ startTime, durationMinutes: 30, maxBlocks: index === 0 ? 3 : 1 }));

test("seleciona e remove somente blocos consecutivos", () => {
  assert.deepEqual(selectFixedMultipleSlot(slots, null, 1, "08:00"), { startTime: "08:00", blocks: 1, rejected: false });
  assert.deepEqual(selectFixedMultipleSlot(slots, "08:00", 1, "08:30"), { startTime: "08:00", blocks: 2, rejected: false });
  assert.deepEqual(selectFixedMultipleSlot(slots, "08:00", 2, "08:30"), { startTime: "08:00", blocks: 1, rejected: false });
});

test("rejeita lacunas e respeita maxBlocks", () => {
  assert.deepEqual(selectFixedMultipleSlot(slots, "08:00", 3, "10:00"), { startTime: "08:00", blocks: 3, rejected: true });
  assert.deepEqual(consecutiveSelectionTimes(slots, "08:00", 3), ["08:00", "08:30", "09:00"]);
});
