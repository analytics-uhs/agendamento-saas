import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { endsNextDay, formatBookingTimeRange, intervalEndMinutes, timeToMinutes } from "./time-of-day";
import { fixedMultipleEndTime } from "./fixed-multiple-selection";

test("time ranges omit overnight indicators without changing their interval", () => {
  for (const [start,end,expected] of [
    ["22:00","23:00","22:00–23:00"],
    ["23:00","00:00","23:00–00:00"],
    ["23:15","00:15","23:15–00:15"],
    ["23:30","00:30","23:30–00:30"],
    ["23:00","24:00","23:00–00:00"],
  ]) {
    assert.equal(formatBookingTimeRange(start,end),expected);
    assert.equal(intervalEndMinutes(start,end)-timeToMinutes(start),60);
  }
  assert.equal(endsNextDay("23:15","00:15"),true);
  assert.equal(endsNextDay("22:00","23:00"),false);
  assert.equal(fixedMultipleEndTime("23:15",60,1),"00:15");
  assert.equal(fixedMultipleEndTime("23:15",60,2),"01:15");
});

test("public summaries and shared Admin editors do not restore redundant overnight labels", () => {
  for (const path of ["src/components/booking/booking-flow.tsx","src/components/business-hour-day.tsx","src/components/admin/calendar-block-modal.tsx"]) {
    assert.doesNotMatch(readFileSync(path,"utf8"),/termina no dia seguinte|dia seguinte|\+1 dia/i);
  }
  // Both final confirmation and Admin details use the corrected shared formatter.
  for (const path of ["src/components/booking/booking-confirmation.tsx","src/components/admin/appointment-details.tsx"]) {
    assert.match(readFileSync(path,"utf8"),/formatBookingTimeRange\(/);
  }
});
