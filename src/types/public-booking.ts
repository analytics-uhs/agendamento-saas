import type { DurationMode } from "@/types/database";
import type { VisualThemePreference } from "@/types/business";
import type { Palette } from "@/types/scheduling";

export type PublicBookingOption = { id: string; name: string; durationMinutes: number | null };
export type PublicBookingGroup = {
  position: 1 | 2;
  label: string;
  required: boolean;
  options: PublicBookingOption[];
};
export type PublicBusinessHour = { weekday: number; startTime: string; endTime: string };
export type PublicBookingData = {
  business: { id: string; name: string; slug: string; whatsapp: string | null; logoUrl: string | null; address: string | null; googleMapsUrl: string | null; instagramUrl: string | null; facebookUrl: string | null };
  groups: PublicBookingGroup[];
  hours: PublicBusinessHour[];
  settings: {
    durationMode: DurationMode;
    fixedDurationMinutes: number;
    allowMultipleBlocks: boolean;
    palette: Palette;
    themePreference: VisualThemePreference;
  };
};
export type BookingSlot = { startTime: string; durationMinutes: number; maxBlocks: number };
export type BookingConfirmation = {
  business: { name: string; slug: string; logoUrl: string | null };
  group1: { label: string; name: string } | null;
  group2: { label: string; name: string } | null;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  customerName: string;
};
export type PublicActionResult<T> = { ok: true; data: T } | { ok: false; message: string; conflict?: boolean; staleSelection?: boolean };
