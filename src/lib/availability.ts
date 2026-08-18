import type { AppointmentStatus, DurationMode } from "@/types/database";
import type { BookingSlot } from "@/types/public-booking";

export type BusyInterval = { startTime: string; endTime: string; status: AppointmentStatus };
export type AvailabilityInput = {
  date: string;
  today: string;
  currentTime?: string;
  businessHour: { active: boolean; startTime: string; endTime: string } | null;
  durationMode: DurationMode;
  fixedDurationMinutes: number;
  group2DurationMinutes?: number | null;
  appointments: BusyInterval[];
};

export function timeToMinutes(value: string) {
  const [hours = 0, minutes = 0] = value.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

export function intervalsOverlap(newStart: number, newEnd: number, existingStart: number, existingEnd: number) {
  return newStart < existingEnd && newEnd > existingStart;
}

export function generateAvailability(input: AvailabilityInput): BookingSlot[] {
  if (!input.businessHour?.active || input.date < input.today) return [];
  const duration = input.durationMode === "group_2" ? input.group2DurationMinutes : input.fixedDurationMinutes;
  if (!duration || !Number.isInteger(duration) || duration <= 0) return [];

  const opening = timeToMinutes(input.businessHour.startTime);
  const closing = timeToMinutes(input.businessHour.endTime);
  const now = input.date === input.today && input.currentTime ? timeToMinutes(input.currentTime) : null;
  const busy = input.appointments
    .filter((appointment) => appointment.status !== "cancelled")
    .map((appointment) => ({ start: timeToMinutes(appointment.startTime), end: timeToMinutes(appointment.endTime) }));
  const slots: BookingSlot[] = [];

  for (let start = opening; start + duration <= closing; start += duration) {
    if (now !== null && start <= now) continue;
    if (input.durationMode === "fixed_multiple") {
      let maxBlocks = 0;
      for (let blocks = 1; start + duration * blocks <= closing; blocks += 1) {
        if (busy.some((appointment) => intervalsOverlap(start, start + duration * blocks, appointment.start, appointment.end))) break;
        maxBlocks = blocks;
      }
      if (maxBlocks) slots.push({ startTime: minutesToTime(start), durationMinutes: duration, maxBlocks });
      continue;
    }

    if (!busy.some((appointment) => intervalsOverlap(start, start + duration, appointment.start, appointment.end))) {
      slots.push({ startTime: minutesToTime(start), durationMinutes: duration, maxBlocks: 1 });
    }
  }
  return slots;
}

export function normalizeWhatsapp(value: string) {
  return value.replace(/\D/g, "");
}

export function validateWhatsapp(value: string) {
  const normalized = normalizeWhatsapp(value);
  return normalized.length >= 10 && normalized.length <= 15;
}
