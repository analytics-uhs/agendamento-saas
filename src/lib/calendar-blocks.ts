import type { DailyCalendarWindow } from "@/types/appointments";
import { endTimeToMinutes, minutesToTime, timeToMinutes } from "@/lib/time-of-day";

export function calendarBlockSlots(
  windows: DailyCalendarWindow[],
  slotMinutes: number,
) {
  const safeStep = Math.max(5, slotMinutes);
  return windows.flatMap((window) => {
    const result: string[] = [];
    for (
      let minute = timeToMinutes(window.startTime);
      minute < endTimeToMinutes(window.endTime);
      minute += safeStep
    ) result.push(minutesToTime(minute));
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
  const step = range.length > 1 ? timeToMinutes(range[1]) - timeToMinutes(range[0]) : 0;
  if (range.some((time, index) => index > 0 && timeToMinutes(time) - timeToMinutes(range[index - 1]) !== step))
    return [clicked];
  return range;
}

export function calendarBlockEndTime(
  selected: string[],
  slotMinutes: number,
) {
  if (!selected.length) return null;
  return minutesToTime(timeToMinutes(selected[selected.length - 1]) + Math.max(5, slotMinutes));
}

export function toggleCalendarBlockResource(
  selected: string[],
  resourceId: string,
) {
  return selected.includes(resourceId)
    ? selected.filter((id) => id !== resourceId)
    : [...selected, resourceId];
}
