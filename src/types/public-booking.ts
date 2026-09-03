import type { PublicBookingStartOrder } from "@/lib/public-booking-start-order";
import type { BookingGroupOccupancyMode, DurationMode } from "@/types/database";
import type { VisualThemePreference } from "@/types/business";
import type { BookingGroupPosition } from "@/lib/booking-groups";
import type { Palette } from "@/types/scheduling";

export type PublicBookingOption = { id: string; name: string; durationMinutes: number | null; availableWeekdays?: number[] };
export type PublicBookingGroup = {
  position: BookingGroupPosition;
  label: string;
  required: boolean;
  intentName: string | null;
  occupancyMode: BookingGroupOccupancyMode | null;
  options: PublicBookingOption[];
};
export type PublicBusinessHour = { weekday: number; startTime: string; endTime: string };
export type PublicBookingData = {
  business: { id: string; name: string; slug: string; whatsapp: string | null; logoUrl: string | null; address: string | null; googleMapsUrl: string | null; instagramUrl: string | null; facebookUrl: string | null };
  groups: PublicBookingGroup[];
  hours: PublicBusinessHour[];
  settings: {
    publicBookingStartOrder?: PublicBookingStartOrder;
    durationMode: DurationMode;
    fixedDurationMinutes: number;
    allowMultipleBlocks: boolean;
    palette: Palette;
    themePreference: VisualThemePreference;
  };
};
export type BookingSlot = { startTime: string; durationMinutes: number; maxBlocks: number };
export type BookingIntent = "primary" | "complementary" | "combined";
export type ComplementaryAvailabilityOption = { id: string; name: string; available: boolean };
export type ComplementaryAvailability = {
  configured: boolean;
  groupName: string | null;
  intentName: string | null;
  occupancyMode: BookingGroupOccupancyMode | null;
  reservationDate: string | null;
  startTime: string | null;
  endTime: string | null;
  options: ComplementaryAvailabilityOption[];
};
export type PublicReservationPayload = {
  customer_name: string;
  customer_whatsapp: string;
  primary?: { group_1_option_id: string | null; group_2_option_id: string | null; date: string; start_time: string; blocks: number };
  complementary?: { option_id: string; occupancy_mode: BookingGroupOccupancyMode; date: string; start_time?: string; end_time?: string };
};
export type BookingConfirmation = {
  business: { name: string; slug: string; logoUrl: string | null; whatsapp?: string | null };
  group1: { label: string; name: string } | null;
  group2: { label: string; name: string } | null;
  complementary: { label: string; name: string; occupancyMode: BookingGroupOccupancyMode; startTime: string | null; endTime: string | null } | null;
  appointmentDate: string;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number | null;
  customerName: string;
  appearance?: { palette: Palette; themePreference: VisualThemePreference };
};
export type PublicActionResult<T> = { ok: true; data: T } | { ok: false; message: string; conflict?: boolean; staleSelection?: boolean };
