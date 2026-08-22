import assert from "node:assert/strict";
import test from "node:test";
import { buildAppointmentReminderMessage, buildAppointmentWhatsappUrl, canSendAppointmentWhatsappReminder } from "./appointment-reminder";
import { todayInTimeZone } from "./date";
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
  series: null,
  group1: { id: "group-1-option", label: "Profissional", name: "Rebeca" },
  group2: { id: "group-2-option", label: "Serviço", name: "Corte + barba" },
};

test("monta o lembrete com Grupo 1 e Grupo 2", () => {
  assert.equal(buildAppointmentReminderMessage(appointment, "2026-08-21"), [
    "Olá, João! 😊",
    "",
    "Passando para lembrar do seu agendamento amanhã, às 15:30.",
    "",
    "• Rebeca",
    "• Corte + barba",
    "",
    "Caso precise cancelar ou alterar o horário, entre em contato conosco por aqui.",
    "",
    "Até lá! 😊",
  ].join("\n"));
});

test("omite somente o Grupo 2 quando ele não existe", () => {
  const message = buildAppointmentReminderMessage({ ...appointment, group2: null }, "2026-08-21");
  assert.match(message, /• Rebeca/);
  assert.doesNotMatch(message, /Corte \+ barba/);
});

test("omite somente o Grupo 1 quando ele não existe", () => {
  const message = buildAppointmentReminderMessage({ ...appointment, group1: null }, "2026-08-21");
  assert.doesNotMatch(message, /Rebeca/);
  assert.match(message, /• Corte \+ barba/);
});

test("funciona sem grupos configurados", () => {
  const message = buildAppointmentReminderMessage({ ...appointment, group1: null, group2: null }, "2026-08-21");
  assert.doesNotMatch(message, /•/);
  assert.match(message, /amanhã, às 15:30/);
  assert.doesNotMatch(message, /agendamento amanhã[^.]+\.\n\n\nCaso/);
});

test("nunca inclui os labels configuráveis dos grupos", () => {
  const message = buildAppointmentReminderMessage({
    ...appointment,
    group1: { ...appointment.group1!, label: "Selecione sua quadra" },
    group2: { ...appointment.group2!, label: "Qual serviço deseja?" },
  }, "2026-08-21");

  assert.doesNotMatch(message, /Selecione sua quadra|Qual serviço deseja/);
  assert.match(message, /• Rebeca\n• Corte \+ barba/);
});

test("formata dias úteis com 'na', DD/MM, sem ano e preserva HH:mm", () => {
  const weekdays = [
    ["2026-08-24", "segunda-feira"],
    ["2026-08-25", "terça-feira"],
    ["2026-08-26", "quarta-feira"],
    ["2026-08-27", "quinta-feira"],
    ["2026-08-28", "sexta-feira"],
  ] as const;

  for (const [appointmentDate, weekday] of weekdays) {
    const message = buildAppointmentReminderMessage({ ...appointment, appointmentDate, startTime: "09:00:00" }, "2026-08-21");
    assert.match(message, new RegExp(`na ${weekday}, dia ${appointmentDate.slice(8, 10)}\\/08, às 09:00`));
    assert.doesNotMatch(message, /2026/);
  }
});

test("formata sábado e domingo com 'no'", () => {
  const saturday = buildAppointmentReminderMessage({ ...appointment, appointmentDate: "2026-08-29", startTime: "10:00" }, "2026-08-21");
  const sunday = buildAppointmentReminderMessage({ ...appointment, appointmentDate: "2026-08-30", startTime: "10:00" }, "2026-08-21");

  assert.match(saturday, /no sábado, dia 29\/08, às 10:00/);
  assert.match(sunday, /no domingo, dia 30\/08, às 10:00/);
  assert.doesNotMatch(`${saturday}\n${sunday}`, /na sábado|na domingo|2026/);
});

test("identifica amanhã pela data de calendário em America/Sao_Paulo, não pela data UTC", () => {
  const instantNearUtcMidnight = new Date("2026-08-22T01:30:00.000Z");
  const currentDateInBrazil = todayInTimeZone("America/Sao_Paulo", instantNearUtcMidnight);
  const message = buildAppointmentReminderMessage(appointment, currentDateInBrazil);

  assert.equal(currentDateInBrazil, "2026-08-21");
  assert.match(message, /agendamento amanhã, às 15:30/);
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
