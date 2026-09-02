import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parsePublicBookingPage } from "./repositories/public-booking";

test("parser preserva negócio legado e interpreta Grupo complementar", () => {
  const base = { business: { id: "business", name: "Arena", slug: "arena" }, hours: [], settings: { duration_mode: "fixed", fixed_duration_minutes: 60, allow_multiple_blocks: false, palette: { id: "original" }, theme_preference: "light" } };
  const legacy = parsePublicBookingPage({ ...base, groups: [{ position: 1, label: "Quadra", required: true, options: [] }] });
  assert.equal(legacy?.groups.length, 1); assert.equal(legacy?.groups[0]?.intentName, null);
  const combined = parsePublicBookingPage({ ...base, groups: [{ position: 3, label: "Escolha o apoio", required: false, intent_name: "Churrasqueira", occupancy_mode: "day", options: [{ id: "option", name: "Churrasqueira 1", duration_minutes: null }] }] });
  assert.deepEqual(combined?.groups[0], { position: 3, label: "Escolha o apoio", required: false, intentName: "Churrasqueira", occupancyMode: "day", options: [{ id: "option", name: "Churrasqueira 1", durationMinutes: null }] });
});

test("parser mantém payload legado e aceita weekdays curados de horário custom", () => {
  const base = { business: { id: "business", name: "Arena", slug: "arena" }, hours: [], settings: { duration_mode: "fixed", fixed_duration_minutes: 60, allow_multiple_blocks: false, palette: { id: "original" }, theme_preference: "light" } };
  const booking = parsePublicBookingPage({ ...base, groups: [{ position: 1, label: "Quadra", required: true, options: [
    { id: "business-option", name: "Quadra 1", duration_minutes: null },
    { id: "custom-option", name: "Quadra 2", duration_minutes: null, available_weekdays: [1, 3, 9, "2"] },
  ] }] });
  assert.equal(booking?.groups[0]?.options[0]?.availableWeekdays, undefined);
  assert.deepEqual(booking?.groups[0]?.options[1]?.availableWeekdays, [1, 3]);
});

test("fluxo público mantém acessibilidade básica e layouts mobile-first", () => {
  const source = readFileSync("src/components/booking/booking-flow.tsx", "utf8");
  assert.match(source, /aria-pressed=\{intent === option\.id\}/);
  assert.match(source, /focus-ring min-h-24/);
  assert.match(source, /grid gap-3 md:grid-cols-3/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /Use Voltar para revisar suas escolhas/);
});

test("confirmação contempla reserva do dia e componente complementar", () => {
  const source = readFileSync("src/components/booking/booking-confirmation.tsx", "utf8");
  assert.match(source, /Reserva do dia/);
  assert.match(source, /confirmation\.complementary/);
  assert.match(source, /Entrar em contato pelo WhatsApp/);
});
