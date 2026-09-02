import test from "node:test";
import assert from "node:assert/strict";
import { revalidateAdminTimeSelection } from "./admin-time-selection";
import { selectFixedMultipleSlot, fixedMultipleEndTime } from "./fixed-multiple-selection";
import { buildManualAppointmentInput } from "./appointments";

const slots = (times: string[], durationMinutes = 60) => times.map((startTime, index) => ({ startTime, durationMinutes, maxBlocks: times.length - index }));

test("Admin shares public consecutive selection for 60/30/45 minutes and :15 anchors", () => {
  for (const [times, duration, end] of [
    [["18:00", "19:00", "20:00"], 60, "21:00"],
    [["18:15", "19:15"], 60, "20:15"],
    [["18:00", "18:30", "19:00"], 30, "19:30"],
    [["18:15", "19:00", "19:45"], 45, "20:30"],
  ] as const) {
    const available = slots([...times], duration);
    let selection: { startTime: string | null; blocks: number } = { startTime: null, blocks: 1 };
    for (const time of times) {
      const next = selectFixedMultipleSlot(available, selection.startTime, selection.blocks, time);
      assert.equal(next.rejected, false);
      selection = next;
    }
    assert.equal(fixedMultipleEndTime(selection.startTime!, duration, selection.blocks), end);
    assert.deepEqual(revalidateAdminTimeSelection(available, selection.startTime, selection.blocks, true), { startTime: times[0], blocks: times.length });
  }
});

test("fixed and group_2 keep a single initial slot", () => {
  assert.deepEqual(revalidateAdminTimeSelection(slots(["18:00", "19:00"]), "18:00", 3, false), { startTime: "18:00", blocks: 1 });
});

test("holes and a partial conflict cannot extend or preserve an invalid chain", () => {
  const available = slots(["18:00", "20:00"]);
  assert.equal(selectFixedMultipleSlot(available, "18:00", 1, "20:00").rejected, true);
  assert.deepEqual(revalidateAdminTimeSelection(available, "18:00", 3, true), { startTime: "18:00", blocks: 1 });
  assert.deepEqual(revalidateAdminTimeSelection([{ startTime: "18:00", durationMinutes: 60, maxBlocks: 1 }, ...slots(["19:00"])], "18:00", 2, true), { startTime: "18:00", blocks: 1 });
});

test("new resource/date availability clears missing starts and shortens invalid selections", () => {
  assert.deepEqual(revalidateAdminTimeSelection(slots(["18:15", "19:15"]), "18:00", 3, true), { startTime: null, blocks: 1 });
  assert.deepEqual(revalidateAdminTimeSelection(slots(["18:00", "19:00"]), "18:00", 3, true), { startTime: "18:00", blocks: 2 });
  assert.deepEqual(revalidateAdminTimeSelection([], "18:00", 1, true), { startTime: null, blocks: 1 });
});

test("deselecting uses the public clear/shorten rule", () => {
  const available = slots(["18:00", "19:00", "20:00"]);
  assert.deepEqual(selectFixedMultipleSlot(available, "18:00", 3, "19:00"), { startTime: "18:00", blocks: 1, rejected: false });
  assert.deepEqual(selectFixedMultipleSlot(available, "18:00", 3, "18:00"), { startTime: null, blocks: 1, rejected: false });
});

test("three blocks produce one input with one customer, not three appointments", () => {
  const input = buildManualAppointmentInput({ group1OptionId: "option", group2OptionId: null, date: "2030-01-07", startTime: "18:00", blocks: 3, customerName: "João", customerWhatsapp: "(53) 99999-9999" });
  assert.equal(Array.isArray(input), false);
  assert.equal(input.blocks, 3);
  assert.equal(input.startTime, "18:00");
  assert.equal(input.customerName, "João");
});
