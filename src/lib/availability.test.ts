import assert from "node:assert/strict";
import test from "node:test";
import { formatWhatsappInput, generateAvailability, intervalsOverlap, normalizeWhatsapp } from "./availability";
import type { AvailabilityInput, BusyInterval } from "./availability";

const base: AvailabilityInput = {
  date: "2026-08-19",
  today: "2026-08-18",
  businessHours: [{ active: true, startTime: "08:00", endTime: "12:00" }],
  durationMode: "fixed",
  fixedDurationMinutes: 60,
  appointments: [],
};
const appointment = (startTime: string, endTime: string, status: BusyInterval["status"] = "scheduled"): BusyInterval => ({ startTime, endTime, status });

test("gera horários para duração fixa", () => {
  assert.deepEqual(generateAvailability(base).map((slot) => slot.startTime), ["08:00", "09:00", "10:00", "11:00"]);
});

test("usa a duração da opção do Grupo 2", () => {
  const slots = generateAvailability({ ...base, durationMode: "group_2", group2DurationMinutes: 45 });
  assert.deepEqual(slots.map((slot) => slot.startTime), ["08:00", "08:45", "09:30", "10:15", "11:00"]);
});

test("calcula somente blocos múltiplos consecutivos", () => {
  const slots = generateAvailability({ ...base, durationMode: "fixed_multiple", appointments: [appointment("10:00", "11:00")] });
  assert.deepEqual(slots.map(({ startTime, maxBlocks }) => [startTime, maxBlocks]), [["08:00", 2], ["09:00", 1], ["11:00", 1]]);
});

test("não gera horários fora do funcionamento ou em dia fechado", () => {
  assert.equal(generateAvailability({ ...base, businessHours: [{ active: true, startTime: "08:00", endTime: "08:30" }] }).length, 0);
  assert.equal(generateAvailability({ ...base, businessHours: [{ active: false, startTime: "08:00", endTime: "12:00" }] }).length, 0);
});

test("gera slots em duas janelas e preserva o intervalo de almoço", () => {
  const slots = generateAvailability({ ...base, businessHours: [
    { active: true, startTime: "08:00", endTime: "11:00" },
    { active: true, startTime: "14:00", endTime: "20:00" },
  ] });
  assert.deepEqual(slots.map((slot) => slot.startTime), ["08:00", "09:00", "10:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"]);
});

test("blocos múltiplos e duração do Grupo 2 nunca atravessam o fechamento", () => {
  const businessHours = [{ active: true, startTime: "08:00", endTime: "11:00" }];
  const multiple = generateAvailability({ ...base, businessHours, durationMode: "fixed_multiple" });
  assert.equal(multiple.find((slot) => slot.startTime === "10:00")?.maxBlocks, 1);
  const group2 = generateAvailability({ ...base, businessHours, durationMode: "group_2", group2DurationMinutes: 90 });
  assert.equal(group2.some((slot) => slot.startTime === "10:00"), false);
});

test("reserva no início bloqueia o primeiro slot e libera o limite final", () => {
  const slots = generateAvailability({ ...base, appointments: [appointment("08:00", "09:00")] });
  assert.deepEqual(slots.map((slot) => slot.startTime), ["09:00", "10:00", "11:00"]);
});

test("reserva no fim do expediente bloqueia somente o último slot", () => {
  const slots = generateAvailability({ ...base, appointments: [appointment("11:00", "12:00")] });
  assert.deepEqual(slots.map((slot) => slot.startTime), ["08:00", "09:00", "10:00"]);
});

test("detecta conflitos parciais, totais e aceita intervalos adjacentes", () => {
  assert.equal(intervalsOverlap(570, 630, 600, 660), true);
  assert.equal(intervalsOverlap(600, 630, 600, 660), true);
  assert.equal(intervalsOverlap(630, 690, 600, 660), true);
  assert.equal(intervalsOverlap(540, 600, 600, 660), false);
  assert.equal(intervalsOverlap(660, 720, 600, 660), false);
});

test("appointment cancelado não bloqueia", () => {
  const slots = generateAvailability({ ...base, appointments: [appointment("09:00", "10:00", "cancelled")] });
  assert.equal(slots.some((slot) => slot.startTime === "09:00"), true);
});

test("janela de hoje remove horários passados e o horário corrente", () => {
  const slots = generateAvailability({ ...base, date: "2026-08-18", currentTime: "09:00" });
  assert.deepEqual(slots.map((slot) => slot.startTime), ["10:00", "11:00"]);
});

test("não oferece datas passadas", () => {
  assert.equal(generateAvailability({ ...base, date: "2026-08-17" }).length, 0);
});

test("gera o slot de 23:00 quando a janela termina à meia-noite", () => {
  const result = generateAvailability({
    ...base,
    businessHours: [{ active: true, startTime: "17:00", endTime: "00:00" }],
    fixedDurationMinutes: 60,
  });
  assert.deepEqual(result.map((slot) => slot.startTime), ["17:00", "18:00", "19:00", "20:00", "21:00", "22:00", "23:00"]);
});

test("duração de 120 minutos cabe às 22:00, mas não às 23:00", () => {
  const result = generateAvailability({
    ...base,
    durationMode: "group_2",
    group2DurationMinutes: 120,
    businessHours: [{ active: true, startTime: "17:00", endTime: "00:00" }],
  });
  assert.equal(result.some((slot) => slot.startTime === "22:00"), true);
  assert.equal(result.some((slot) => slot.startTime === "23:00"), false);
});

test("fixed_multiple permite dois blocos terminando exatamente à meia-noite", () => {
  const result = generateAvailability({
    ...base,
    durationMode: "fixed_multiple",
    fixedDurationMinutes: 60,
    businessHours: [{ active: true, startTime: "17:00", endTime: "00:00" }],
  });
  assert.equal(result.find((slot) => slot.startTime === "22:00")?.maxBlocks, 2);
  assert.equal(result.find((slot) => slot.startTime === "23:00")?.maxBlocks, 1);
});

test("formata WhatsApp brasileiro enquanto o usuário digita", () => {
  assert.equal(formatWhatsappInput("5"), "(5");
  assert.equal(formatWhatsappInput("53"), "(53");
  assert.equal(formatWhatsappInput("539"), "(53) 9");
  assert.equal(formatWhatsappInput("53991414018"), "(53) 99141-4018");
  assert.equal(formatWhatsappInput("5312345678"), "(53) 1234-5678");
  assert.equal(formatWhatsappInput(""), "");
});

test("aceita colagem com símbolos ou +55, limita o campo e persiste somente dígitos", () => {
  assert.equal(formatWhatsappInput("+55 (53) 99141-4018"), "(53) 99141-4018");
  assert.equal(formatWhatsappInput("(53) 99141-4018abc"), "(53) 99141-4018");
  assert.equal(formatWhatsappInput("539914140189999"), "(53) 99141-4018");
  assert.equal(normalizeWhatsapp(formatWhatsappInput("+55 (53) 99141-4018")), "53991414018");
});
