import { cloneBusinessHourWindows, validateBusinessHours, weekdayLabels } from "@/lib/business-form";
import { displayEndTime } from "@/lib/time-of-day";
import type { BusinessHourForm } from "@/types/business";
import type { BookingOptionScheduleMode, Database } from "@/types/database";

export type OptionSchedule = {
  name: string;
  mode: BookingOptionScheduleMode;
  hours: BusinessHourForm[];
};

type HourRow = { weekday: number; active: boolean; start_time: string; end_time: string };

export function optionScheduleDays(rows: HourRow[]): BusinessHourForm[] {
  return weekdayLabels.map((label, weekday) => ({
    weekday, label,
    active: rows.some((row) => row.weekday === weekday && row.active),
    windows: rows.filter((row) => row.weekday === weekday && row.active).map((row) => ({
      startTime: row.start_time.slice(0, 5), endTime: displayEndTime(row.end_time),
    })),
  }));
}

export function initialOptionScheduleHours(mode: BookingOptionScheduleMode, stored: HourRow[], business: HourRow[]) {
  // An explicitly custom schedule with zero rows means closed, never inherited.
  return optionScheduleDays(mode === "custom" || stored.length > 0 ? stored : business);
}

export function validateOptionSchedule(mode: unknown, hours: unknown): string | null {
  if (mode !== "business" && mode !== "custom") return "Escolha como definir o horário de disponibilidade.";
  if (mode === "business") return null;
  if (!Array.isArray(hours) || hours.length !== 7 || hours.some((day) =>
    !day || !Number.isInteger(day.weekday) || day.weekday < 0 || day.weekday > 6 ||
    typeof day.active !== "boolean" || !Array.isArray(day.windows) || day.windows.some((window: unknown) =>
      !window || typeof window !== "object" || !("startTime" in window) || !("endTime" in window) ||
      typeof window.startTime !== "string" || typeof window.endTime !== "string"
    )
  )) return "Revise os períodos dos sete dias da semana.";
  return validateBusinessHours((hours as BusinessHourForm[]).map((day) => ({
    ...day, label: weekdayLabels[day.weekday], windows: day.active ? day.windows : [],
  })));
}

export function optionSchedulePayload(optionId: string, mode: BookingOptionScheduleMode, hours: BusinessHourForm[]): Database["public"]["Functions"]["set_admin_booking_option_schedule"]["Args"] {
  if (mode === "business") return { p_option_id: optionId, p_schedule_mode: mode };
  return {
    p_option_id: optionId, p_schedule_mode: mode,
    p_hours: [...hours].sort((a, b) => a.weekday - b.weekday).map((day) => ({
      weekday: day.weekday,
      windows: day.active ? cloneBusinessHourWindows(day.windows)
        .sort((a, b) => a.startTime.localeCompare(b.startTime))
        .map((window) => ({ start_time: window.startTime, end_time: window.endTime })) : [],
    })),
  };
}

export function optionScheduleError(code?: string): string {
  if (code === "42501" || code === "PGRST116") return "Esta opção não está disponível para edição. Atualize a página e tente novamente.";
  if (code === "23P01" || code === "23505") return "Os períodos do mesmo dia não podem se sobrepor ou se repetir.";
  if (code === "22023" || code === "23514") return "Revise os dias e horários informados antes de salvar.";
  return "Não foi possível salvar os horários. Tente novamente; suas alterações foram mantidas.";
}

export const optionScheduleSuccess = (name: string) => `Horários de ${name} atualizados.`;
