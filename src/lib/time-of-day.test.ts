import assert from "node:assert/strict";
import test from "node:test";
import {
  displayEndTime,
  endTimeToMinutes,
  isValidSameDayTimeRange,
  minutesToTime,
} from "./time-of-day";

test("interpreta 00:00 final como o limite de 1440 minutos", () => {
  assert.equal(endTimeToMinutes("00:00"), 1440);
  assert.equal(displayEndTime("24:00:00"), "00:00");
  assert.equal(minutesToTime(1440), "00:00");
});

test("aceita somente meia-noite como fechamento especial do mesmo dia", () => {
  assert.equal(isValidSameDayTimeRange("17:00", "00:00"), true);
  assert.equal(isValidSameDayTimeRange("00:00", "06:00"), true);
  assert.equal(isValidSameDayTimeRange("17:00", "17:00"), false);
  assert.equal(isValidSameDayTimeRange("22:00", "02:00"), false);
  assert.equal(isValidSameDayTimeRange("00:00", "00:00"), false);
});
