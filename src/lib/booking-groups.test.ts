import assert from "node:assert/strict";
import test from "node:test";
import {
  bookingGroupPosition,
  bookingGroupProductName,
  bookingGroupRole,
} from "./booking-groups";

test("mapeia os papéis semânticos para as posições compatíveis", () => {
  assert.equal(bookingGroupPosition("primary"), 1);
  assert.equal(bookingGroupPosition("secondary"), 2);
  assert.equal(bookingGroupPosition("complementary"), 3);
});

test("mapeia posições para papéis sem alterar os nomes técnicos legados", () => {
  assert.equal(bookingGroupRole(1), "primary");
  assert.equal(bookingGroupRole(2), "secondary");
  assert.equal(bookingGroupRole(3), "complementary");
  assert.equal(bookingGroupRole(4), null);
});

test("fornece a terminologia de produto centralizada", () => {
  assert.equal(bookingGroupProductName(1), "Grupo principal");
  assert.equal(bookingGroupProductName(2), "Grupo secundário");
  assert.equal(bookingGroupProductName(3), "Grupo complementar");
  assert.equal(bookingGroupProductName(99), "Grupo");
});
