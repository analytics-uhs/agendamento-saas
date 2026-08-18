import { businessHourFor, parseISO } from "@/lib/date";
import type { MockAppState } from "@/types/scheduling";

const toMinutes = (value: string) => {
  const [hours = 0, minutes = 0] = value.split(":").map(Number);
  return hours * 60 + minutes;
};
const toTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export function availableSlots(state: MockAppState, date: string) {
  const hours = businessHourFor(state.hours, date);
  if (!hours?.enabled) return [];
  const taken = new Set(state.appointments.filter((item) => item.date === date && item.status === "scheduled").map((item) => item.time));
  const result: string[] = [];
  const seed = parseISO(date).getDate();
  let index = 0;
  for (let minute = toMinutes(hours.start); minute + 30 <= toMinutes(hours.end); minute += 30, index += 1) {
    const time = toTime(minute);
    if (!taken.has(time) && (seed + index) % 7 !== 3) result.push(time);
  }
  return result;
}
