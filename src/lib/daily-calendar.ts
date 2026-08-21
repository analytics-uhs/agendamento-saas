import type {
  AdminAppointment,
  AppointmentSchedulingConfig,
  DailyCalendarWindow,
} from "@/types/appointments";

export type DailyCalendarResource = { id: string | null; name: string };
export type DailyCalendarSection = DailyCalendarWindow & { slots: string[] };

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

export function buildDailyCalendarSections(
  windows: DailyCalendarWindow[],
  slotMinutes: number,
  appointments: AdminAppointment[],
): DailyCalendarSection[] {
  const safeStep = Math.max(5, slotMinutes);
  return windows.map((window) => {
    const start = toMinutes(window.startTime);
    const end = toMinutes(window.endTime);
    const slots = new Set<string>();
    for (let minute = start; minute < end; minute += safeStep)
      slots.add(toTime(minute));
    appointments.forEach((appointment) => {
      const minute = toMinutes(appointment.startTime);
      if (minute >= start && minute < end) slots.add(appointment.startTime);
    });
    return {
      ...window,
      slots: [...slots].sort((left, right) => toMinutes(left) - toMinutes(right)),
    };
  });
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
