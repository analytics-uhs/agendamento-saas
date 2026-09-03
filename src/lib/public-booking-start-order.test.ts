import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { isPublicBookingStartOrder, parsePublicBookingStartOrder } from "./public-booking-start-order";

test("legacy metadata defaults to service-first; settings accepts only supported orders", () => {
  for (const value of [undefined, null, "other", 1]) {
    assert.equal(parsePublicBookingStartOrder(value), "service_first");
    assert.equal(isPublicBookingStartOrder(value), false);
  }
  for (const value of ["service_first", "date_first"] as const) {
    assert.equal(parsePublicBookingStartOrder(value), value);
    assert.equal(isPublicBookingStartOrder(value), true);
  }
});

test("order is persisted by authenticated action and passed through curated metadata", () => {
  const actions = readFileSync("src/app/admin/actions.ts", "utf8");
  const save = actions.slice(actions.indexOf("export async function savePublicBookingStartOrder"), actions.indexOf("export async function saveBookingNotice"));
  assert.match(save, /await context\(\)/);
  assert.match(save, /isPublicBookingStartOrder\(value\)/);
  assert.match(save, /public_booking_start_order: value/);
  assert.match(save, /eq\("business_id", current.business.id\)/);
  assert.match(readFileSync("src/lib/repositories/public-booking.ts", "utf8"), /parsePublicBookingStartOrder\(settings.public_booking_start_order\)/);
  assert.match(readFileSync("src/components/admin/business-hours.tsx", "utf8"), /savePublicBookingStartOrder\(startOrder\)/);
});
