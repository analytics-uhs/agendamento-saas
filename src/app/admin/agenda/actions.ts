"use server";

import { revalidatePath } from "next/cache";
import { normalizeWhatsapp, validateWhatsapp } from "@/lib/availability";
import { requireCurrentBusiness } from "@/lib/repositories/businesses";
import { createAdminAppointment, createRecurringAppointmentSeries, cancelRecurringAppointment as cancelRecurringAppointmentRepository, getAdminAvailability, getAdminEditAvailability, getBusinessHoursForDate, listAppointments, updateAdminAppointmentOccurrence, updateAppointmentStatus } from "@/lib/repositories/appointments";
import { formatNumericDate } from "@/lib/date";
import type { AppointmentActionResult, AppointmentAvailabilityResult, AdminAppointment, DailyCalendarData, ManualAppointmentInput, RecurringAppointmentInput, RecurringCancellationScope } from "@/types/appointments";
import type { AppointmentStatus } from "@/types/database";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const targets = ["scheduled", "completed", "cancelled", "no_show"] as const;

function validOption(value: string | null) {
  return value === null || uuid.test(value);
}

function actionError(message: string, code?: string): AppointmentActionResult<never> {
  if (message.includes("recurring_conflicts:")) {
    try {
      const conflicts = JSON.parse(message.slice(message.indexOf("recurring_conflicts:") + 20)) as { date: string; start_time: string }[];
      return { ok: false, conflict: true, message: `Não foi possível criar a recorrência. Existem conflitos em:\n\n${conflicts.map((item) => `${formatNumericDate(item.date)} às ${item.start_time}`).join("\n")}` };
    } catch { return { ok: false, conflict: true, message: "Não foi possível criar a recorrência porque um ou mais horários estão ocupados." }; }
  }
  if (message.includes("appointment_restore_conflict")) return { ok: false, conflict: true, message: "Não foi possível restaurar este agendamento porque o horário já está ocupado." };
  if (code === "23P01" || message.includes("booking_conflict")) return { ok: false, conflict: true, message: "Este horário acabou de ser reservado. Escolha outro horário disponível." };
  if (message.includes("booking_invalid_group")) return { ok: false, staleSelection: true, message: "Uma opção selecionada não está mais disponível." };
  if (message.includes("appointment_invalid_status_transition")) return { ok: false, message: "Este agendamento não permite mais essa alteração de status." };
  if (message.includes("appointment_not_found") || code === "42501") return { ok: false, message: "Agendamento não encontrado ou sem permissão de acesso." };
  if (message.includes("booking_business_unavailable")) return { ok: false, message: "Este estabelecimento não está disponível para novos agendamentos." };
  if (message.includes("booking_group_2_duration") || message.includes("booking_invalid_duration") || message.includes("booking_invalid_blocks")) return { ok: false, message: "A configuração de duração do estabelecimento está inconsistente." };
  if (message.includes("booking_business_closed") || message.includes("booking_outside_business_hours") || message.includes("booking_invalid_date")) return { ok: false, message: "A data ou horário não está mais disponível." };
  if (message.includes("booking_invalid_whatsapp")) return { ok: false, message: "Informe um WhatsApp válido com DDD." };
  return { ok: false, message: "Não foi possível concluir a operação. Tente novamente." };
}

export async function loadAdminAppointments(date: string): Promise<AppointmentActionResult<AdminAppointment[]>> {
  if (!datePattern.test(date)) return { ok: false, message: "Data inválida." };
  const business = await requireCurrentBusiness();
  try {
    return { ok: true, message: "Agenda atualizada.", data: await listAppointments(business.id, date) };
  } catch {
    return { ok: false, message: "Não foi possível carregar os agendamentos." };
  }
}

export async function loadDailyAdminCalendar(
  date: string,
): Promise<AppointmentActionResult<DailyCalendarData>> {
  if (!datePattern.test(date)) return { ok: false, message: "Data inválida." };
  const business = await requireCurrentBusiness();
  try {
    const [appointments, windows] = await Promise.all([
      listAppointments(business.id, date),
      getBusinessHoursForDate(business.id, date),
    ]);
    return {
      ok: true,
      message: "Agenda diária atualizada.",
      data: { appointments, windows },
    };
  } catch {
    return { ok: false, message: "Não foi possível carregar a agenda diária." };
  }
}

export async function loadAdminAvailability(input: Pick<ManualAppointmentInput, "date" | "group1OptionId" | "group2OptionId">): Promise<AppointmentAvailabilityResult> {
  if (!datePattern.test(input.date) || !validOption(input.group1OptionId) || !validOption(input.group2OptionId)) return { ok: false, message: "Seleção inválida." };
  const business = await requireCurrentBusiness();
  if (!business.active) return { ok: false, message: "Este estabelecimento está inativo e não aceita novos agendamentos." };
  const result = await getAdminAvailability({ businessSlug: business.slug, ...input });
  return result.error ? actionError(result.error.message, result.error.code) : { ok: true, message: "Horários atualizados.", data: result.data };
}

export async function loadAdminEditAvailability(appointmentId: string, input: Pick<ManualAppointmentInput, "date" | "group1OptionId" | "group2OptionId">): Promise<AppointmentAvailabilityResult> {
  if (!uuid.test(appointmentId) || !datePattern.test(input.date) || !validOption(input.group1OptionId) || !validOption(input.group2OptionId)) return { ok: false, message: "Seleção inválida." };
  await requireCurrentBusiness();
  const result = await getAdminEditAvailability({ appointmentId, ...input });
  return result.error ? actionError(result.error.message, result.error.code) : { ok: true, message: "Horários atualizados.", data: result.data };
}

export async function createManualAppointment(input: ManualAppointmentInput): Promise<AppointmentActionResult<AdminAppointment[]>> {
  if (!datePattern.test(input.date) || !timePattern.test(input.startTime) || !validOption(input.group1OptionId) || !validOption(input.group2OptionId) || !Number.isInteger(input.blocks) || input.blocks < 1) return { ok: false, message: "Revise os dados do agendamento." };
  if (input.customerName.trim().length < 2) return { ok: false, message: "Informe o nome do cliente." };
  if (!validateWhatsapp(input.customerWhatsapp)) return { ok: false, message: "Informe um WhatsApp válido com DDD." };
  const business = await requireCurrentBusiness();
  if (!business.active) return { ok: false, message: "Este estabelecimento está inativo e não aceita novos agendamentos." };
  const error = await createAdminAppointment({ ...input, customerName: input.customerName.trim(), customerWhatsapp: normalizeWhatsapp(input.customerWhatsapp) });
  if (error) return actionError(error.message, error.code);
  revalidatePath("/admin");
  revalidatePath("/admin/agenda");
  return { ok: true, message: "Agendamento criado.", data: await listAppointments(business.id, input.date) };
}

export async function createRecurringAppointment(input: RecurringAppointmentInput): Promise<AppointmentActionResult<AdminAppointment[]>> {
  if (!datePattern.test(input.date) || !timePattern.test(input.startTime) || !validOption(input.group1OptionId) || !validOption(input.group2OptionId) || !Number.isInteger(input.blocks) || input.blocks < 1 || (input.repeatCount !== null && (!Number.isInteger(input.repeatCount) || input.repeatCount < 2))) return { ok: false, message: "Revise os dados da recorrência." };
  if (input.customerName.trim().length < 2) return { ok: false, message: "Informe o nome do cliente." };
  if (!validateWhatsapp(input.customerWhatsapp)) return { ok: false, message: "Informe um WhatsApp válido com DDD." };
  const business = await requireCurrentBusiness();
  if (!business.active) return { ok: false, message: "Este estabelecimento está inativo e não aceita novos agendamentos." };
  const error = await createRecurringAppointmentSeries({ ...input, customerName: input.customerName.trim(), customerWhatsapp: normalizeWhatsapp(input.customerWhatsapp) });
  if (error) return actionError(error.message, error.code);
  revalidatePath("/admin");
  revalidatePath("/admin/agenda");
  return { ok: true, message: "Recorrência criada.", data: await listAppointments(business.id, input.date) };
}

export async function editAppointmentOccurrence(appointmentId: string, input: ManualAppointmentInput): Promise<AppointmentActionResult<AdminAppointment[]>> {
  if (!uuid.test(appointmentId) || !datePattern.test(input.date) || !timePattern.test(input.startTime) || !validOption(input.group1OptionId) || !validOption(input.group2OptionId) || !Number.isInteger(input.blocks) || input.blocks < 1) return { ok: false, message: "Revise os dados do agendamento." };
  if (input.customerName.trim().length < 2) return { ok: false, message: "Informe o nome do cliente." };
  if (!validateWhatsapp(input.customerWhatsapp)) return { ok: false, message: "Informe um WhatsApp válido com DDD." };
  const business = await requireCurrentBusiness();
  const error = await updateAdminAppointmentOccurrence(appointmentId, { ...input, customerName: input.customerName.trim(), customerWhatsapp: normalizeWhatsapp(input.customerWhatsapp) });
  if (error) return actionError(error.message, error.code);
  revalidatePath("/admin");
  revalidatePath("/admin/agenda");
  return { ok: true, message: "Agendamento atualizado. A série recorrente não foi alterada.", data: await listAppointments(business.id, input.date) };
}

export async function cancelRecurringAppointment(appointmentId: string, scope: RecurringCancellationScope, date: string): Promise<AppointmentActionResult<AdminAppointment[]>> {
  if (!uuid.test(appointmentId) || !datePattern.test(date) || !["single", "future"].includes(scope)) return { ok: false, message: "Cancelamento inválido." };
  const business = await requireCurrentBusiness();
  const error = await cancelRecurringAppointmentRepository(appointmentId, scope);
  if (error) return actionError(error.message, error.code);
  revalidatePath("/admin");
  revalidatePath("/admin/agenda");
  return { ok: true, message: scope === "single" ? "Esta ocorrência foi cancelada." : "Esta ocorrência e as próximas foram canceladas. A série foi encerrada.", data: await listAppointments(business.id, date) };
}

export async function changeAppointmentStatus(appointmentId: string, status: AppointmentStatus, date: string): Promise<AppointmentActionResult<AdminAppointment[]>> {
  if (!uuid.test(appointmentId) || !datePattern.test(date) || !targets.some((target) => target === status)) return { ok: false, message: "Alteração de status inválida." };
  const business = await requireCurrentBusiness();
  const error = await updateAppointmentStatus(appointmentId, status);
  if (error) return actionError(error.message, error.code);
  revalidatePath("/admin");
  revalidatePath("/admin/agenda");
  return { ok: true, message: status === "scheduled" ? "Agendamento restaurado." : "Status atualizado.", data: await listAppointments(business.id, date) };
}
