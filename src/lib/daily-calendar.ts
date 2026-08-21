import type {
  AdminAppointment,
  AppointmentSchedulingConfig,
  DailyCalendarWindow,
} from "@/types/appointments";

export type DailyCalendarResource = { id: string | null; name: string };
export type DailyCalendarRow = { time: string; open: boolean };

function toMinutes(time: string) {
  const [hours = 0, minutes = 0] = time.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

function toTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

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
): DailyCalendarRow[] {
  if (!windows.length) return [];
  const safeStep = Math.max(5, slotMinutes);
  const first = Math.min(...windows.map((window) => toMinutes(window.startTime)));
  const last = Math.max(...windows.map((window) => toMinutes(window.endTime)));
  const times = new Set<string>();
  for (let minute = first; minute < last; minute += safeStep) times.add(toTime(minute));
  times.add(toTime(last));
  appointments.forEach((appointment) => {
    const minute = toMinutes(appointment.startTime);
    if (minute >= first && minute < last) times.add(appointment.startTime);
  });
  return [...times]
    .sort((left, right) => toMinutes(left) - toMinutes(right))
    .map((time) => {
      const start = toMinutes(time);
      return {
        time,
        open: windows.some(
          (window) =>
            start >= toMinutes(window.startTime) &&
            start + safeStep <= toMinutes(window.endTime),
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
      appointment.startTime <= time &&
      time < appointment.endTime,
  );
}
