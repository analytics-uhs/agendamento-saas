import { normalizeWhatsapp, validateWhatsapp } from "@/lib/availability";
import { addDays, formatTime, parseISO, todayInTimeZone, toISO } from "@/lib/date";
import type { AdminAppointment } from "@/types/appointments";

type ReminderAppointment = Pick<
  AdminAppointment,
  "customerName" | "customerWhatsapp" | "appointmentDate" | "startTime" | "status" | "group1" | "group2"
>;

export function canSendAppointmentWhatsappReminder(appointment: Pick<ReminderAppointment, "customerWhatsapp" | "status">) {
  return appointment.status === "scheduled" && validateWhatsapp(appointment.customerWhatsapp);
}

const weekdayDescriptions = [
  { name: "domingo", preposition: "no" },
  { name: "segunda-feira", preposition: "na" },
  { name: "terça-feira", preposition: "na" },
  { name: "quarta-feira", preposition: "na" },
  { name: "quinta-feira", preposition: "na" },
  { name: "sexta-feira", preposition: "na" },
  { name: "sábado", preposition: "no" },
] as const;

function formatAppointmentMoment(appointmentDate: string, startTime: string, currentDate: string) {
  const time = formatTime(startTime);

  if (appointmentDate === currentDate) {
    return `hoje, às ${time}`;
  }

  if (appointmentDate === toISO(addDays(currentDate, 1))) {
    return `amanhã, às ${time}`;
  }

  const date = parseISO(appointmentDate);
  const weekday = weekdayDescriptions[date.getDay()];
  const dayMonth = `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;

  return `${weekday.preposition} ${weekday.name}, dia ${dayMonth}, às ${time}`;
}

export function buildAppointmentReminderMessage(
  appointment: Omit<ReminderAppointment, "customerWhatsapp" | "status">,
  currentDate = todayInTimeZone(),
) {
  const groupLines = [appointment.group1, appointment.group2]
    .filter((group): group is NonNullable<typeof group> => Boolean(group))
    .map((group) => `• ${group.name}`);

  return [
    `Olá, ${appointment.customerName}! 😊`,
    "",
    `Passando para lembrar do seu agendamento ${formatAppointmentMoment(appointment.appointmentDate, appointment.startTime, currentDate)}.`,
    ...(groupLines.length ? ["", ...groupLines] : []),
    "",
    "Caso precise cancelar ou alterar o horário, entre em contato conosco por aqui.",
    "",
    "Até lá! 😊",
  ].join("\n");
}

export function buildAppointmentWhatsappUrl(appointment: ReminderAppointment) {
  if (!canSendAppointmentWhatsappReminder(appointment)) return null;

  const message = buildAppointmentReminderMessage(appointment);
  return `https://wa.me/${normalizeWhatsapp(appointment.customerWhatsapp)}?text=${encodeURIComponent(message)}`;
}
