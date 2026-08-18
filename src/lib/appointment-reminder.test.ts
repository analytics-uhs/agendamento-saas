import assert from "node:assert/strict";
import test from "node:test";
import { buildAppointmentReminderMessage, buildAppointmentWhatsappUrl, canSendAppointmentWhatsappReminder } from "./appointment-reminder";
import type { AdminAppointment } from "../types/appointments";

const appointment: AdminAppointment = {
  id: "appointment-id",
  customerName: "João",
  customerWhatsapp: "+55 (11) 98765-4321",
  appointmentDate: "2026-08-22",
  startTime: "15:30",
  endTime: "16:30",
  durationMinutes: 60,
  status: "scheduled",
  source: "public",
  reminderSentAt: null,
  reminderSentBy: null,
  group1: { label: "Profissional", name: "Rebeca" },
  group2: { label: "Serviço", name: "Corte + barba" },
};

test("monta o lembrete com Grupo 1 e Grupo 2", () => {
  assert.equal(buildAppointmentReminderMessage(appointment), [
    "Olá, João! 😊",
    "",
    "Passando para lembrar do seu agendamento no dia 22/08/2026 às 15:30.",
    "",
    "Profissional: Rebeca",
    "",
    "Serviço: Corte + barba",
    "",
    "Caso precise cancelar ou alterar o horário, entre em contato conosco por aqui.",
    "",
    "Até lá! 😊",
  ].join("\n"));
});

test("omite somente o Grupo 2 quando ele não existe", () => {
  const message = buildAppointmentReminderMessage({ ...appointment, group2: null });
  assert.match(message, /Profissional: Rebeca/);
  assert.doesNotMatch(message, /Serviço:/);
});

test("omite somente o Grupo 1 quando ele não existe", () => {
  const message = buildAppointmentReminderMessage({ ...appointment, group1: null });
  assert.doesNotMatch(message, /Profissional:/);
  assert.match(message, /Serviço: Corte \+ barba/);
});

test("funciona sem grupos configurados", () => {
  const message = buildAppointmentReminderMessage({ ...appointment, group1: null, group2: null });
  assert.doesNotMatch(message, /Profissional:|Serviço:/);
  assert.match(message, /22\/08\/2026 às 15:30/);
});

test("normaliza o telefone e codifica acentos, caracteres especiais e quebras de linha", () => {
  const url = buildAppointmentWhatsappUrl(appointment);
  assert.ok(url);
  assert.match(url, /^https:\/\/wa\.me\/5511987654321\?text=/);
  assert.match(url, /%0A/);
  assert.match(url, /Jo%C3%A3o/);
  assert.match(url, /Corte%20%2B%20barba/);
  assert.equal(new URL(url).searchParams.get("text"), buildAppointmentReminderMessage(appointment));
});

test("libera o lembrete apenas para scheduled com telefone válido", () => {
  assert.equal(canSendAppointmentWhatsappReminder(appointment), true);
  assert.equal(canSendAppointmentWhatsappReminder({ ...appointment, status: "completed" }), false);
  assert.equal(canSendAppointmentWhatsappReminder({ ...appointment, status: "cancelled" }), false);
  assert.equal(canSendAppointmentWhatsappReminder({ ...appointment, status: "no_show" }), false);
  assert.equal(canSendAppointmentWhatsappReminder({ ...appointment, customerWhatsapp: "123" }), false);
  assert.equal(buildAppointmentWhatsappUrl({ ...appointment, status: "completed" }), null);
  assert.equal(buildAppointmentWhatsappUrl({ ...appointment, status: "cancelled" }), null);
  assert.equal(buildAppointmentWhatsappUrl({ ...appointment, status: "no_show" }), null);
  assert.equal(buildAppointmentWhatsappUrl({ ...appointment, customerWhatsapp: "123" }), null);
});
