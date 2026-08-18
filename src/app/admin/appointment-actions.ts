"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentBusiness } from "@/lib/repositories/businesses";
import { markAppointmentReminderSent } from "@/lib/repositories/appointments";
import type { AppointmentReminderResult } from "@/types/appointments";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function recordAppointmentReminder(appointmentId: string): Promise<AppointmentReminderResult> {
  if (!uuid.test(appointmentId)) return { ok: false, message: "Agendamento inválido." };

  await requireCurrentBusiness();
  const result = await markAppointmentReminderSent(appointmentId);
  if (result.error || !result.data) {
    if (result.error?.message.includes("appointment_reminder_invalid_status")) {
      return { ok: false, message: "Este agendamento não permite mais lembretes." };
    }
    return { ok: false, message: "Não foi possível registrar o lembrete." };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/agenda");
  return { ok: true, message: "Lembrete enviado", data: { reminderSentAt: result.data } };
}
