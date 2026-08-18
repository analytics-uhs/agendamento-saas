export type GroupOption = { id: string; name: string; durationMinutes?: number };
export type GroupConfig = { label: string; enabled: boolean; options: GroupOption[] };
export type DurationMode = "fixed" | "fixed-multiple" | "group2";
export type DurationConfig = { mode: DurationMode; fixedMinutes: number; maxBlocks: number };
export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type BusinessHour = { day: DayKey; label: string; enabled: boolean; start: string; end: string };
export type Business = { name: string; whatsapp: string; slug: string };
export type AppointmentStatus = "scheduled" | "done" | "canceled" | "no-show";
export type Appointment = {
  id: string; date: string; time: string; durationMinutes: number; customer: string;
  whatsapp: string; group1?: string; group2?: string; status: AppointmentStatus;
};
export type Palette = {
  id: string; name: string; primary: string; accent: string; background: string;
  surface: string; text: string; muted: string; border: string;
};
export type MockAppState = {
  business: Business; group1: GroupConfig; group2: GroupConfig; duration: DurationConfig;
  hours: BusinessHour[]; paletteId: string; appointments: Appointment[];
};
