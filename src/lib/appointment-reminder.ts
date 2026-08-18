import { normalizeWhatsapp, validateWhatsapp } from "@/lib/availability";
import { formatNumericDate, formatTime } from "@/lib/date";
import type { AdminAppointment } from "@/types/appointments";

type ReminderAppointment = Pick<
  AdminAppointment,
  "customerName" | "customerWhatsapp" | "appointmentDate" | "startTime" | "status" | "group1" | "group2"
>;

export function canSendAppointmentWhatsappReminder(appointment: Pick<ReminderAppointment, "customerWhatsapp" | "status">) {
  return appointment.status === "scheduled" && validateWhatsapp(appointment.customerWhatsapp);
}

export function buildAppointmentReminderMessage(appointment: Omit<ReminderAppointment, "customerWhatsapp" | "status">) {
  const groupLines = [appointment.group1, appointment.group2]
    .filter((group): group is NonNullable<typeof group> => Boolean(group))
    .map((group) => `${group.label}: ${group.name}`);

  return [
    `Olá, ${appointment.customerName}! 😊`,
    "",
    `Passando para lembrar do seu agendamento no dia ${formatNumericDate(appointment.appointmentDate)} às ${formatTime(appointment.startTime)}.`,
    ...groupLines.flatMap((line) => ["", line]),
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
