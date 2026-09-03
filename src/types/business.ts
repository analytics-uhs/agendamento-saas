import type { PublicBookingStartOrder } from "@/lib/public-booking-start-order";
import type { BookingGroupPosition } from "@/lib/booking-groups";
import type { BookingGroupOccupancyMode, DurationMode, ThemePreference } from "@/types/database";

export type VisualThemePreference = Exclude<ThemePreference, "system">;

export type BusinessOptionForm = { id?: string; name: string; durationMinutes: number | null };
export type BusinessGroupForm = {
  id?: string; position: BookingGroupPosition; label: string; active: boolean; required: boolean;
  intentName: string; occupancyMode: BookingGroupOccupancyMode | null;
  options: BusinessOptionForm[];
};
export type BusinessHourWindowForm = { id?: string; startTime: string; endTime: string };
export type BusinessHourForm = {
  weekday: number; label: string; active: boolean; windows: BusinessHourWindowForm[];
};
export type BusinessForm = {
  id?: string; name: string; slug: string; whatsapp: string; logoUrl: string | null;
  address: string; googleMapsUrl: string; instagramUrl: string; facebookUrl: string;
  groups: [BusinessGroupForm, BusinessGroupForm, BusinessGroupForm];
  hours: BusinessHourForm[];
  durationMode: DurationMode;
  fixedDurationMinutes: number;
  minimumBookingNoticeMinutes?: number;
  publicBookingStartOrder?: PublicBookingStartOrder;
  paletteId: string;
  themePreference: VisualThemePreference;
};
export type ActionResult<T = unknown> =
  | { ok: true; message: string; data?: T }
  | { ok: false; message: string };
