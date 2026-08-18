import type { DurationMode, ThemePreference } from "@/types/database";

export type BusinessOptionForm = { id?: string; name: string; durationMinutes: number | null };
export type BusinessGroupForm = {
  id?: string; position: 1 | 2; label: string; active: boolean; required: boolean;
  options: BusinessOptionForm[];
};
export type BusinessHourForm = {
  id?: string; weekday: number; label: string; active: boolean; startTime: string; endTime: string;
};
export type BusinessForm = {
  id?: string; name: string; slug: string; whatsapp: string; logoUrl: string | null;
  groups: [BusinessGroupForm, BusinessGroupForm];
  hours: BusinessHourForm[];
  durationMode: DurationMode;
  fixedDurationMinutes: number;
  paletteId: string;
  themePreference: ThemePreference;
};
export type ActionResult<T = unknown> =
  | { ok: true; message: string; data?: T }
  | { ok: false; message: string };
