import type { DailyCalendarWindow } from "@/types/appointments";

function toMinutes(time: string) {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function toTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function calendarBlockSlots(
  windows: DailyCalendarWindow[],
  slotMinutes: number,
) {
  const safeStep = Math.max(5, slotMinutes);
  return windows.flatMap((window) => {
    const result: string[] = [];
    for (
      let minute = toMinutes(window.startTime);
      minute < toMinutes(window.endTime);
      minute += safeStep
    ) result.push(toTime(minute));
    return result;
  });
}

export function selectCalendarBlockSlot(
  slots: string[],
  selected: string[],
  clicked: string,
) {
  if (!slots.includes(clicked)) return selected;
  if (!selected.length || selected.length > 1) return [clicked];
  const startIndex = slots.indexOf(selected[0]);
  const endIndex = slots.indexOf(clicked);
  if (endIndex < startIndex) return [clicked];
  const range = slots.slice(startIndex, endIndex + 1);
  const step = range.length > 1 ? toMinutes(range[1]) - toMinutes(range[0]) : 0;
  if (range.some((time, index) => index > 0 && toMinutes(time) - toMinutes(range[index - 1]) !== step))
    return [clicked];
  return range;
}

export function calendarBlockEndTime(
  selected: string[],
  slotMinutes: number,
) {
  if (!selected.length) return null;
  return toTime(toMinutes(selected[selected.length - 1]) + Math.max(5, slotMinutes));
}

export function toggleCalendarBlockResource(
  selected: string[],
  resourceId: string,
) {
  return selected.includes(resourceId)
    ? selected.filter((id) => id !== resourceId)
    : [...selected, resourceId];
}
