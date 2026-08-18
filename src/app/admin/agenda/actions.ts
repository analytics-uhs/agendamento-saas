"use server";

import { revalidatePath } from "next/cache";
import { normalizeWhatsapp, validateWhatsapp } from "@/lib/availability";
import { requireCurrentBusiness } from "@/lib/repositories/businesses";
import { createAdminAppointment, getAdminAvailability, listAppointments, updateAppointmentStatus } from "@/lib/repositories/appointments";
import type { AppointmentActionResult, AppointmentAvailabilityResult, AdminAppointment, ManualAppointmentInput } from "@/types/appointments";
import type { AppointmentStatus } from "@/types/database";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const targets = ["completed", "cancelled", "no_show"] as const;

function validOption(value: string | null) {
  return value === null || uuid.test(value);
}

function actionError(message: string, code?: string): AppointmentActionResult<never> {
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

export async function loadAdminAvailability(input: Pick<ManualAppointmentInput, "date" | "group1OptionId" | "group2OptionId">): Promise<AppointmentAvailabilityResult> {
  if (!datePattern.test(input.date) || !validOption(input.group1OptionId) || !validOption(input.group2OptionId)) return { ok: false, message: "Seleção inválida." };
  const business = await requireCurrentBusiness();
  const result = await getAdminAvailability({ businessSlug: business.slug, ...input });
  return result.error ? actionError(result.error.message, result.error.code) : { ok: true, message: "Horários atualizados.", data: result.data };
}

export async function createManualAppointment(input: ManualAppointmentInput): Promise<AppointmentActionResult<AdminAppointment[]>> {
  if (!datePattern.test(input.date) || !timePattern.test(input.startTime) || !validOption(input.group1OptionId) || !validOption(input.group2OptionId) || !Number.isInteger(input.blocks) || input.blocks < 1) return { ok: false, message: "Revise os dados do agendamento." };
  if (input.customerName.trim().length < 2) return { ok: false, message: "Informe o nome do cliente." };
  if (!validateWhatsapp(input.customerWhatsapp)) return { ok: false, message: "Informe um WhatsApp válido com DDD." };
  const business = await requireCurrentBusiness();
  const error = await createAdminAppointment({ ...input, customerName: input.customerName.trim(), customerWhatsapp: normalizeWhatsapp(input.customerWhatsapp) });
  if (error) return actionError(error.message, error.code);
  revalidatePath("/admin");
  revalidatePath("/admin/agenda");
  return { ok: true, message: "Agendamento criado.", data: await listAppointments(business.id, input.date) };
}

export async function changeAppointmentStatus(appointmentId: string, status: AppointmentStatus, date: string): Promise<AppointmentActionResult<AdminAppointment[]>> {
  if (!uuid.test(appointmentId) || !datePattern.test(date) || !targets.some((target) => target === status)) return { ok: false, message: "Alteração de status inválida." };
  const business = await requireCurrentBusiness();
  const error = await updateAppointmentStatus(appointmentId, status as (typeof targets)[number]);
  if (error) return actionError(error.message, error.code);
  revalidatePath("/admin");
  revalidatePath("/admin/agenda");
  return { ok: true, message: "Status atualizado.", data: await listAppointments(business.id, date) };
}
