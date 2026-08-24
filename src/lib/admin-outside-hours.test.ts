import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const modalSource = readFileSync(
  new URL("../components/admin/appointment-form-modal.tsx", import.meta.url),
  "utf8",
);
const repositorySource = readFileSync(
  new URL("./repositories/appointments.ts", import.meta.url),
  "utf8",
);

test("modal informa horário fora do funcionamento sem transformar a condição em erro", () => {
  assert.match(modalSource, /fora do funcionamento configurado/);
  assert.match(modalSource, /role="status"/);
  assert.doesNotMatch(modalSource, /disabled=\{[^}]*outsideBusinessHours/);
});

test("disponibilidade administrativa usa RPC autenticada separada da pública", () => {
  assert.match(repositorySource, /rpc\("get_admin_booking_availability"/);
});
