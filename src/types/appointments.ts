import type { AppointmentSource, AppointmentStatus, DurationMode } from "@/types/database";
import type { BookingSlot } from "@/types/public-booking";
import type { LegacyBookingGroupPosition } from "@/lib/booking-groups";

export type AppointmentGroupSelection = { id: string; label: string; name: string };
export type AppointmentSeriesSummary = {
  id: string;
  weekday: number;
  startTime: string;
  startsOn: string;
  repeatCount: number | null;
  active: boolean;
  occurrenceNumber: number;
};

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
  reminderSentAt: string | null;
  reminderSentBy: string | null;
  series: AppointmentSeriesSummary | null;
  group1: AppointmentGroupSelection | null;
  group2: AppointmentGroupSelection | null;
  complementary?: AdminComplementaryReservation | null;
};

export type AppointmentOption = { id: string; name: string; durationMinutes: number | null };
export type AppointmentGroup = { position: LegacyBookingGroupPosition; label: string; options: AppointmentOption[] };
export type AppointmentSchedulingConfig = {
  groups: AppointmentGroup[];
  complementaryGroup?: { label: string; intentName: string; occupancyMode: "day" | "time_slot"; options: AppointmentOption[] } | null;
  durationMode: DurationMode;
  fixedDurationMinutes: number;
  businessHours?: Array<DailyCalendarWindow & { weekday: number }>;
};

export type DailyCalendarWindow = { startTime: string; endTime: string };
export type CalendarBlockSeriesSummary = {
  id: string;
  startsOn: string;
  repeatCount: number | null;
  active: boolean;
};
export type CalendarBlock = {
  id: string;
  blockDate: string;
  startTime: string;
  endTime: string;
  reason: string | null;
  group1: AppointmentGroupSelection | null;
  series: CalendarBlockSeriesSummary | null;
};
export type ResourceBlockSeriesSummary = {
  id: string;
  startsOn: string;
  repeatCount: number | null;
  active: boolean;
};
export type ResourceBlock = {
  id: string;
  blockDate: string;
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
  occupancyMode: "day" | "time_slot";
  option: AppointmentOption;
  series: ResourceBlockSeriesSummary | null;
};
export type DailyCalendarData = {
  appointments: AdminAppointment[];
  complementaryReservations?: AdminComplementaryReservation[];
  blocks: CalendarBlock[];
  resourceBlocks?: ResourceBlock[];
  windows: DailyCalendarWindow[];
};

export type ResourceBlockInput = {
  optionIds: string[];
  date: string;
  startTime: string | null;
  endTime: string | null;
  reason: string;
  recurring: boolean;
  repeatCount: number | null;
};

export type AdminComplementaryReservation = {
  id: string;
  reservationId: string;
  optionId: string;
  customerName: string;
  customerWhatsapp: string;
  reservationDate: string;
  startTime: string | null;
  endTime: string | null;
  occupancyMode: "day" | "time_slot";
  status: AppointmentStatus;
  groupName: string;
  optionName: string;
};

export type AdminReservationIntent = "primary" | "complementary" | "combined";
export type ManualReservationInput = {
  intent: AdminReservationIntent;
  primary: ManualAppointmentInput | null;
  complementary: { optionId: string; occupancyMode: "day" | "time_slot"; date: string; startTime: string | null; endTime: string | null } | null;
  customerName: string;
  customerWhatsapp: string;
};

export type CalendarBlockInput = {
  group1OptionIds: string[];
  date: string;
  startTime: string;
  endTime: string;
  reason: string;
  recurring: boolean;
  repeatCount: number | null;
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

export type RecurringAppointmentInput = ManualAppointmentInput & {
  repeatCount: number | null;
};

export type RecurringCancellationScope = "single" | "future";

export type AppointmentActionResult<T = undefined> =
  | { ok: true; message: string; data: T }
  | { ok: false; message: string; conflict?: boolean; staleSelection?: boolean };

export type AppointmentAvailabilityResult = AppointmentActionResult<BookingSlot[]>;
export type AppointmentReminderResult = AppointmentActionResult<{ reminderSentAt: string }>;
