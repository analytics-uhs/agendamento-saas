import assert from "node:assert/strict";
import test from "node:test";
import {
  calendarBlockEndTime,
  calendarBlockSlots,
  selectCalendarBlockSlot,
  toggleCalendarBlockResource,
} from "@/lib/calendar-blocks";

test("creates block slots for every business-hours window without crossing lunch", () => {
    assert.deepEqual(calendarBlockSlots([
      { startTime: "08:00", endTime: "10:00" },
      { startTime: "14:00", endTime: "16:00" },
    ], 60), ["08:00", "09:00", "14:00", "15:00"]);
});

test("selects only consecutive slots and computes the interval end", () => {
    const slots = ["08:00", "09:00", "10:00"];
    const selected = selectCalendarBlockSlot(slots, ["08:00"], "10:00");
    assert.deepEqual(selected, slots);
    assert.equal(calendarBlockEndTime(selected, 60), "11:00");
});

test("rejects a discontinuous range across a closed interval", () => {
  assert.deepEqual(
    selectCalendarBlockSlot(["10:00", "11:00", "14:00"], ["10:00"], "14:00"),
    ["14:00"],
  );
});

test("toggles selected resources without duplication", () => {
    assert.deepEqual(toggleCalendarBlockResource(["a", "b"], "a"), ["b"]);
    assert.deepEqual(toggleCalendarBlockResource(["b"], "a"), ["b", "a"]);
});

test("gera bloqueio até meia-noite sem criar um slot 00:00", () => {
  const slots = calendarBlockSlots([{ startTime: "17:00", endTime: "00:00" }], 60);
  assert.deepEqual(slots, ["17:00", "18:00", "19:00", "20:00", "21:00", "22:00", "23:00"]);
  assert.equal(calendarBlockEndTime(["22:00", "23:00"], 60), "00:00");
});
