import { endsNextDay, timeToMinutes } from "@/lib/time-of-day";
import { addDays, toISO } from "@/lib/date";

/** View-only clipping; mutation inputs retain the real date/start/end. */
export function calendarDaySlice(date: string, startTime: string, endTime: string, selectedDate: string) {
  if (date === selectedDate) return {};
  if (toISO(addDays(date, 1)) === selectedDate && endsNextDay(startTime, endTime) && timeToMinutes(endTime) > 0 && timeToMinutes(endTime) < 1440)
    return { calendarStartTime: "00:00", calendarEndTime: endTime };
  return null;
}
