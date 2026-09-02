import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bookingNoticeOptions, validBookingNotice } from "./booking-notice";

test("notice settings offer all requested choices and validate integer minutes", () => {
  assert.deepEqual(bookingNoticeOptions.map(({ minutes }) => minutes), [0,30,60,120,180,360,720,1440]);
  for (const value of [0,30,60,120,1440,2880]) assert.equal(validBookingNotice(value),true);
  for (const value of [-1,1.5,NaN,Infinity,2147483648]) assert.equal(validBookingNotice(value),false);
});

test("Admin notice save is tenant-scoped and the exclusive complementary flow uses server slots", () => {
  const actions=readFileSync("src/app/admin/actions.ts","utf8");
  const save=actions.slice(actions.indexOf("export async function saveBookingNotice"),actions.indexOf("export async function saveHours"));
  assert.match(save,/await context\(\)/);
  assert.match(save,/validBookingNotice\(minutes\)/);
  assert.match(save,/eq\("business_id", current.business.id\)/);
  const flow=readFileSync("src/components/booking/booking-flow.tsx","utf8");
  assert.match(flow,/await getComplementaryTimeSlots/);
  assert.doesNotMatch(flow,/Date\.now\(/);
});
