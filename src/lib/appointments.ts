import type { AppointmentSource, AppointmentStatus, DurationMode } from "@/types/database";
import type { ManualAppointmentInput } from "@/types/appointments";

export const appointmentStatusLabels: Record<AppointmentStatus, string> = {
  scheduled: "Agendado",
  completed: "Concluído",
  cancelled: "Cancelado",
  no_show: "Não compareceu",
};

export const appointmentSourceLabels: Record<AppointmentSource, string> = {
  public: "Página pública",
  admin: "Criado no painel",
};

export const appointmentStatusTargets = ["completed", "cancelled", "no_show"] as const;

export function canTransitionAppointment(current: AppointmentStatus, target: AppointmentStatus) {
  if (current === "scheduled") return appointmentStatusTargets.some((status) => status === target);
  return appointmentStatusTargets.some((status) => status === current) && target === "scheduled";
}

export function manualAppointmentDuration(input: {
  mode: DurationMode;
  fixedDurationMinutes: number;
  group2DurationMinutes: number | null;
  blocks: number;
}) {
  if (!Number.isInteger(input.blocks) || input.blocks < 1) return null;
  if (input.mode === "group_2") {
    return input.blocks === 1 && input.group2DurationMinutes && input.group2DurationMinutes > 0
      ? input.group2DurationMinutes
      : null;
  }
  if (!Number.isInteger(input.fixedDurationMinutes) || input.fixedDurationMinutes <= 0) return null;
  if (input.mode === "fixed" && input.blocks !== 1) return null;
  return input.fixedDurationMinutes * input.blocks;
}

export function initialAppointmentBlocks(input: {
  durationMinutes: number;
  mode: DurationMode;
  fixedDurationMinutes: number;
}) {
  if (input.mode !== "fixed_multiple") return 1;
  return Math.max(1, Math.round(input.durationMinutes / input.fixedDurationMinutes));
}

export function buildManualAppointmentInput(input: ManualAppointmentInput): ManualAppointmentInput {
  return {
    group1OptionId: input.group1OptionId,
    group2OptionId: input.group2OptionId,
    date: input.date,
    startTime: input.startTime,
    blocks: input.blocks,
    customerName: input.customerName,
    customerWhatsapp: input.customerWhatsapp,
  };
}
