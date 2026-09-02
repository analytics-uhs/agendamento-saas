import test from "node:test";
import assert from "node:assert/strict";
import { civilDayWindows, intervalEndMinutes, isValidBookingTimeRange } from "./time-of-day";
import { createEmptyBusinessForm, validateBusinessHours } from "./business-form";
import { selectFixedMultipleSlot } from "./fixed-multiple-selection";
import { calendarDaySlice } from "./calendar-day";
import { buildDailyCalendarRows, isResourceOccupied } from "./daily-calendar";
import type { AdminAppointment } from "@/types/appointments";

test("overnight ranges retain midnight and minute anchors without UTC conversion", () => {
  for (const [start, end, expected] of [["23:15", "00:00", 1440], ["23:15", "00:15", 1455], ["23:30", "00:30", 1470], ["08:00", "18:00", 1080]] as const) {
    assert.equal(isValidBookingTimeRange(start, end), true);
    assert.equal(intervalEndMinutes(start, end), expected);
  }
  assert.equal(isValidBookingTimeRange("23:15", "23:15"), false);
  assert.equal(isValidBookingTimeRange("25:00", "01:00"), false);
});

test("next civil date inherits yesterday's opening anchor, not a midnight anchor", () => {
  assert.deepEqual(civilDayWindows([{ weekday: 1, startTime: "23:15", endTime: "02:15" }], 2), [{ start: -45, end: 135 }]);
  assert.deepEqual(civilDayWindows([{ weekday: 6, startTime: "23:15", endTime: "00:15" }], 0), [{ start: -45, end: 15 }]);
});

test("weekly validation detects overlap into next day and week wrap", () => {
  const hours = createEmptyBusinessForm().hours.map((hour) => ({ ...hour, active: false, windows: [] as {startTime: string; endTime: string}[] }));
  hours[6] = { ...hours[6], active: true, windows: [{ startTime: "23:15", endTime: "00:15" }] };
  assert.equal(validateBusinessHours(hours), null);
  hours[0] = { ...hours[0], active: true, windows: [{ startTime: "00:00", endTime: "01:00" }] };
  assert.match(validateBusinessHours(hours)!, /sobrepor/);
  hours[0].windows[0].startTime = "00:15";
  assert.equal(validateBusinessHours(hours), null);
});

test("today's 00:15 cannot accidentally select tomorrow's extension", () => {
  const slots = ["00:15", "23:15"].map((startTime) => ({ startTime, durationMinutes: 60, maxBlocks: 3 }));
  assert.equal(selectFixedMultipleSlot(slots, "23:15", 1, "00:15").rejected, true);
});

test("daily calendar clips occupancy without changing the real start date", () => {
  const slice = calendarDaySlice("2030-01-07", "23:15", "00:15", "2030-01-08");
  assert.deepEqual(slice, { calendarStartTime: "00:00", calendarEndTime: "00:15" });
  assert.equal(calendarDaySlice("2030-01-07", "23:15", "00:00", "2030-01-08"), null);
  const appointment = { appointmentDate: "2030-01-07", startTime: "23:15", endTime: "00:15", status: "scheduled", group1: null, ...slice } as AdminAppointment;
  assert.equal(isResourceOccupied([appointment], null, "00:00"), true);
  assert.equal(isResourceOccupied([appointment], null, "00:15"), false);
  assert.equal(buildDailyCalendarRows([], 15, [appointment])[0].time, "00:00");
  assert.equal(appointment.appointmentDate, "2030-01-07");
});
