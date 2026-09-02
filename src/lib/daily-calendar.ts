import type {
  AppointmentSchedulingConfig,
} from "@/types/appointments";

export type DailyCalendarResource = { id: string | null; name: string };

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

export function isPastCalendarSlot(date: string, time: string, now = new Date()) {
  const slot = new Date(`${date}T${time}:00`);
  return Number.isNaN(slot.getTime()) || slot.getTime() < now.getTime();
}
