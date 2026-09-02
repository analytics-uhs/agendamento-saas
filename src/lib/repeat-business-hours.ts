import { cloneBusinessHourWindows } from "@/lib/business-form";
import type { BusinessHourForm } from "@/types/business";

export function repeatBusinessHours(hours: BusinessHourForm[], sourceWeekday: number, targets: number[]) {
  const source = hours.find((day) => day.weekday === sourceWeekday);
  if (!source) return hours;
  return hours.map((day) => day.weekday !== sourceWeekday && targets.includes(day.weekday)
    ? { ...day, active: source.active, windows: source.active ? cloneBusinessHourWindows(source.windows) : [] }
    : day);
}

export function overwrittenBusinessDays(hours: BusinessHourForm[], sourceWeekday: number, targets: number[]) {
  const next = repeatBusinessHours(hours, sourceWeekday, targets);
  return hours.filter((day, index) => targets.includes(day.weekday) && day.weekday !== sourceWeekday && day.windows.length > 0
    && (day.active !== next[index].active || JSON.stringify(cloneBusinessHourWindows(day.windows)) !== JSON.stringify(next[index].windows)));
}
