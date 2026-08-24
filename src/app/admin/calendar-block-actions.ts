"use server";

import { revalidatePath } from "next/cache";
import { formatNumericDate } from "@/lib/date";
import { getBusinessHoursForDate } from "@/lib/repositories/appointments";
import { requireCurrentBusiness } from "@/lib/repositories/businesses";
import {
  createCalendarBlocks,
  deleteCalendarBlock,
  listCalendarBlocks,
  updateCalendarBlock,
} from "@/lib/repositories/calendar-blocks";
import type {
  AppointmentActionResult,
  CalendarBlock,
  CalendarBlockInput,
  DailyCalendarWindow,
} from "@/types/appointments";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

function errorMessage(message: string) {
  if (message.includes("calendar_block_conflicts:")) {
    try {
      const raw = message.slice(message.indexOf("calendar_block_conflicts:") + 25);
      const conflicts = JSON.parse(raw) as { date: string; start_time: string }[];
      return `Não foi possível criar o bloqueio. Existem conflitos em:\n\n${conflicts.map((item) => `${formatNumericDate(item.date)} às ${item.start_time}`).join("\n")}`;
    } catch {
      return "Não foi possível criar o bloqueio porque o período está ocupado.";
    }
  }
  if (message.includes("calendar_block_conflict") || message.includes("23P01"))
    return "Já existe um agendamento ou bloqueio neste período. Escolha outro horário.";
  if (message.includes("calendar_block_invalid_resource"))
    return "Uma opção selecionada não está mais disponível.";
  if (message.includes("calendar_block_invalid_interval"))
    return "O período precisa estar dentro do horário de funcionamento.";
  return "Não foi possível salvar o bloqueio. Tente novamente.";
}

function validInput(input: CalendarBlockInput) {
  return (
    datePattern.test(input.date) &&
    timePattern.test(input.startTime) &&
    timePattern.test(input.endTime) &&
    input.startTime < input.endTime &&
    input.group1OptionIds.every((id) => uuid.test(id)) &&
    input.reason.trim().length <= 160 &&
    (!input.recurring || input.repeatCount === null ||
      (Number.isInteger(input.repeatCount) && input.repeatCount >= 2))
  );
}

export async function loadCalendarBlockWindows(
  date: string,
): Promise<AppointmentActionResult<DailyCalendarWindow[]>> {
  if (!datePattern.test(date)) return { ok: false, message: "Data inválida." };
  const business = await requireCurrentBusiness();
  try {
    return {
      ok: true,
      message: "Horários carregados.",
      data: await getBusinessHoursForDate(business.id, date),
    };
  } catch {
    return { ok: false, message: "Não foi possível carregar os horários." };
  }
}

export async function saveCalendarBlock(
  input: CalendarBlockInput,
): Promise<AppointmentActionResult<CalendarBlock[]>> {
  if (!validInput(input)) return { ok: false, message: "Revise os dados do bloqueio." };
  const business = await requireCurrentBusiness();
  const error = await createCalendarBlocks({ ...input, reason: input.reason.trim() });
  if (error) return { ok: false, conflict: error.code === "23P01", message: errorMessage(error.message) };
  revalidatePath("/admin");
  revalidatePath("/admin/agenda");
  return { ok: true, message: input.recurring ? "Bloqueio recorrente criado." : "Bloqueio criado.", data: await listCalendarBlocks(business.id, input.date) };
}

export async function editCalendarBlock(
  id: string,
  input: Pick<CalendarBlockInput, "date" | "startTime" | "endTime" | "reason">,
): Promise<AppointmentActionResult<CalendarBlock[]>> {
  if (!uuid.test(id) || !validInput({ ...input, group1OptionIds: [], recurring: false, repeatCount: null }))
    return { ok: false, message: "Revise os dados do bloqueio." };
  const business = await requireCurrentBusiness();
  const error = await updateCalendarBlock(id, input);
  if (error) return { ok: false, conflict: error.code === "23P01", message: errorMessage(error.message) };
  revalidatePath("/admin");
  revalidatePath("/admin/agenda");
  return { ok: true, message: "Bloqueio atualizado somente nesta ocorrência.", data: await listCalendarBlocks(business.id, input.date) };
}

export async function removeCalendarBlock(
  id: string,
  scope: "single" | "future",
  date: string,
): Promise<AppointmentActionResult<CalendarBlock[]>> {
  if (!uuid.test(id) || !datePattern.test(date) || !["single", "future"].includes(scope))
    return { ok: false, message: "Exclusão inválida." };
  const business = await requireCurrentBusiness();
  const error = await deleteCalendarBlock(id, scope);
  if (error) return { ok: false, message: errorMessage(error.message) };
  revalidatePath("/admin");
  revalidatePath("/admin/agenda");
  return { ok: true, message: scope === "future" ? "Este e os próximos bloqueios foram removidos." : "Bloqueio removido.", data: await listCalendarBlocks(business.id, date) };
}
