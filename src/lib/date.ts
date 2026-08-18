import type { BusinessHour, DayKey } from "@/types/scheduling";

const weekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const dayKeys: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function toISO(date: Date) {
  const local = new Date(date);
  local.setHours(12, 0, 0, 0);
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
}
export function todayISO() { return toISO(new Date()); }
export function todayInTimeZone(timeZone = "America/Sao_Paulo", now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = (type: "year" | "month" | "day") => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}
export function parseISO(value: string) {
  const [year = 1970, month = 1, day = 1] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}
export function addDays(value: string | Date, amount: number) {
  const date = typeof value === "string" ? parseISO(value) : new Date(value);
  date.setDate(date.getDate() + amount);
  return date;
}
export function dateWindow(start: string) { return Array.from({ length: 7 }, (_, index) => toISO(addDays(start, index))); }
export function weekdayShort(value: string) { return weekdays[parseISO(value).getDay()]; }
export function dayNumber(value: string) { return parseISO(value).getDate(); }
export function formatLongDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" }).format(parseISO(value));
}
export function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(parseISO(value));
}
export function businessHourFor(hours: BusinessHour[], date: string) {
  return hours.find((hour) => hour.day === dayKeys[parseISO(date).getDay()]);
}
export function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60), remaining = minutes % 60;
  return remaining ? `${hours}h ${remaining}min` : `${hours}h`;
}
