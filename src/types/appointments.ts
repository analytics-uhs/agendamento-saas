import type { AppointmentSource, AppointmentStatus, DurationMode } from "@/types/database";
import type { BookingSlot } from "@/types/public-booking";

export type AppointmentGroupSelection = { label: string; name: string };

export type AdminAppointment = {
  id: string;
  customerName: string;
  customerWhatsapp: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  status: AppointmentStatus;
  source: AppointmentSource;
  group1: AppointmentGroupSelection | null;
  group2: AppointmentGroupSelection | null;
};

export type AppointmentOption = { id: string; name: string; durationMinutes: number | null };
export type AppointmentGroup = { position: 1 | 2; label: string; options: AppointmentOption[] };
export type AppointmentSchedulingConfig = {
  groups: AppointmentGroup[];
  durationMode: DurationMode;
  fixedDurationMinutes: number;
};

export type ManualAppointmentInput = {
  group1OptionId: string | null;
  group2OptionId: string | null;
  date: string;
  startTime: string;
  blocks: number;
  customerName: string;
  customerWhatsapp: string;
};

export type AppointmentActionResult<T = undefined> =
  | { ok: true; message: string; data: T }
  | { ok: false; message: string; conflict?: boolean; staleSelection?: boolean };

export type AppointmentAvailabilityResult = AppointmentActionResult<BookingSlot[]>;
