"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentBusiness } from "@/lib/repositories/businesses";
import { getOptionSchedule, setOptionSchedule } from "@/lib/repositories/option-schedules";
import { optionScheduleError, optionScheduleSuccess, validateOptionSchedule, type OptionSchedule } from "@/lib/option-schedule-form";
import type { ActionResult, BusinessHourForm } from "@/types/business";
import type { BookingOptionScheduleMode } from "@/types/database";

function errorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error ? String(error.code) : undefined;
}

export async function loadOptionSchedule(optionId: string): Promise<ActionResult<OptionSchedule>> {
  const business = await requireCurrentBusiness();
  try {
    return { ok: true, message: "Horários carregados.", data: await getOptionSchedule(business.id, optionId) };
  } catch {
    return { ok: false, message: "Não foi possível carregar os horários. Tente novamente." };
  }
}

export async function saveOptionSchedule(optionId: string, mode: BookingOptionScheduleMode, hours: BusinessHourForm[]): Promise<ActionResult> {
  const business = await requireCurrentBusiness();
  const validation = validateOptionSchedule(mode, hours);
  if (validation) return { ok: false, message: validation };
  try {
    const name = await setOptionSchedule(business.id, optionId, mode, hours);
    revalidatePath("/admin/configuracao");
    revalidatePath(`/agendar/${business.slug}`);
    return { ok: true, message: optionScheduleSuccess(name) };
  } catch (error) {
    return { ok: false, message: optionScheduleError(errorCode(error)) };
  }
}
