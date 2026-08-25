import type {
  AdminAppointment,
  AppointmentSchedulingConfig,
  CalendarBlock,
  DailyCalendarWindow,
} from "@/types/appointments";
import { endTimeToMinutes, MINUTES_PER_DAY, minutesToTime, timeToMinutes } from "@/lib/time-of-day";

export type DailyCalendarResource = { id: string | null; name: string };
export type DailyCalendarRow = { time: string; open: boolean };

function gcd(left: number, right: number): number {
  return right === 0 ? left : gcd(right, left % right);
}

export function calendarResources(
  config: AppointmentSchedulingConfig,
): { label: string | null; resources: DailyCalendarResource[] } {
  const groupOne = config.groups.find((group) => group.position === 1);
  if (!groupOne)
    return { label: null, resources: [{ id: null, name: "Agenda" }] };
  return {
    label: groupOne.label,
    resources: groupOne.options.map((option) => ({
      id: option.id,
      name: option.name,
    })),
  };
}

export function calendarSlotMinutes(config: AppointmentSchedulingConfig) {
  if (config.durationMode !== "group_2")
    return config.fixedDurationMinutes;
  const durations = config.groups
    .find((group) => group.position === 2)
    ?.options.flatMap((option) =>
      option.durationMinutes && option.durationMinutes > 0
        ? [option.durationMinutes]
        : [],
    );
  return durations?.reduce(gcd) ?? 30;
}

export function buildDailyCalendarRows(
  windows: DailyCalendarWindow[],
  slotMinutes: number,
  appointments: AdminAppointment[],
  blocks: CalendarBlock[] = [],
): DailyCalendarRow[] {
  const safeStep = Math.max(5, slotMinutes);
  const starts = [
    ...windows.map((window) => timeToMinutes(window.startTime)),
    ...appointments.map((appointment) => timeToMinutes(appointment.startTime)),
    ...blocks.map((block) => timeToMinutes(block.startTime)),
  ];
  const ends = [
    ...windows.map((window) => endTimeToMinutes(window.endTime)),
    ...appointments.map((appointment) => endTimeToMinutes(appointment.endTime)),
    ...blocks.map((block) => endTimeToMinutes(block.endTime)),
  ];
  if (!starts.length || !ends.length) return [];
  const first = Math.min(...starts);
  const last = Math.max(...ends);
  const times = new Set<string>();
  for (let minute = first; minute < last; minute += safeStep) times.add(minutesToTime(minute));
  if (last < MINUTES_PER_DAY) times.add(minutesToTime(last));
  appointments.forEach((appointment) => {
    times.add(appointment.startTime);
  });
  blocks.forEach((block) => times.add(block.startTime));
  return [...times]
    .sort((left, right) => timeToMinutes(left) - timeToMinutes(right))
    .map((time) => {
      const start = timeToMinutes(time);
      return {
        time,
        open: windows.some(
          (window) =>
            start >= timeToMinutes(window.startTime) &&
            start + safeStep <= endTimeToMinutes(window.endTime),
        ),
      };
    });
}

export function isPastCalendarSlot(date: string, time: string, now = new Date()) {
  const slot = new Date(`${date}T${time}:00`);
  return Number.isNaN(slot.getTime()) || slot.getTime() < now.getTime();
}

export function appointmentsForResource(
  appointments: AdminAppointment[],
  resourceId: string | null,
  startTime: string,
) {
  return appointments.filter(
    (appointment) =>
      appointment.startTime === startTime &&
      (resourceId === null || appointment.group1?.id === resourceId),
  );
}

export function isResourceOccupied(
  appointments: AdminAppointment[],
  resourceId: string | null,
  time: string,
) {
  return appointments.some(
    (appointment) =>
      appointment.status !== "cancelled" &&
      (resourceId === null || appointment.group1?.id === resourceId) &&
      timeToMinutes(appointment.startTime) <= timeToMinutes(time) &&
      timeToMinutes(time) < endTimeToMinutes(appointment.endTime),
  );
}
