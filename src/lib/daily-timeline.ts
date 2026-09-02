import { intervalEndMinutes, timeToMinutes } from "@/lib/time-of-day";
import type { AdminAppointment, CalendarBlock, DailyCalendarWindow } from "@/types/appointments";

export const TIMELINE_HOUR_HEIGHT = 96;
type Interval = { startTime: string; endTime: string; calendarStartTime?: string; calendarEndTime?: string };

export function timelineInterval(item: Interval) {
  const start = timeToMinutes(item.calendarStartTime ?? item.startTime);
  const end = intervalEndMinutes(item.calendarStartTime ?? item.startTime, item.calendarEndTime ?? item.endTime);
  // The daily repository already projects carry-ins. Clip carry-outs at this day's boundary.
  return { start, end: Math.min(1440, end) };
}

export function dailyTimelineRange(windows: DailyCalendarWindow[], appointments: AdminAppointment[], blocks: CalendarBlock[]) {
  const intervals = [...windows, ...appointments, ...blocks].map(timelineInterval);
  const start = intervals.length ? Math.floor(Math.min(...intervals.map((item) => item.start)) / 60) * 60 : 8 * 60;
  const end = intervals.length ? Math.ceil(Math.max(...intervals.map((item) => item.end)) / 60) * 60 : 20 * 60;
  return { start, end: Math.max(start + 60, end) };
}

export function timelineGeometry(item: Interval, timelineStart: number) {
  const { start, end } = timelineInterval(item);
  return { top: (start - timelineStart) / 60 * TIMELINE_HOUR_HEIGHT, height: (end - start) / 60 * TIMELINE_HOUR_HEIGHT };
}

export function timelineMinuteAt(y: number, start: number, end: number) {
  return Math.max(start, Math.min(end - 1, start + y / TIMELINE_HOUR_HEIGHT * 60));
}

// Snap only to the Admin RPC's candidates: never invent a cadence or apply public hours.
export function nearestTimelineSlot(slots: { startTime: string }[], minute: number) {
  return slots.reduce<string | undefined>((nearest, slot) =>
    !nearest || Math.abs(timeToMinutes(slot.startTime) - minute) < Math.abs(timeToMinutes(nearest) - minute)
      ? slot.startTime : nearest, undefined);
}

// Cancelled appointments may overlap active appointments/blocks. Keep both reachable.
export function timelineLanes<T extends Interval & { id: string }>(items: T[]) {
  const sorted = [...items].sort((a, b) => timelineInterval(a).start - timelineInterval(b).start);
  const result: { item: T; lane: number; lanes: number }[] = [];
  let group: typeof result = [];
  let ends: number[] = [];
  let groupEnd = -1;
  const flush = () => { group.forEach((entry) => { entry.lanes = ends.length; }); result.push(...group); group = []; ends = []; };
  for (const item of sorted) {
    const { start, end } = timelineInterval(item);
    if (start >= groupEnd) flush();
    let lane = ends.findIndex((value) => value <= start);
    if (lane < 0) lane = ends.length;
    ends[lane] = end;
    groupEnd = Math.max(groupEnd, end);
    group.push({ item, lane, lanes: 1 });
  }
  flush();
  return result;
}
