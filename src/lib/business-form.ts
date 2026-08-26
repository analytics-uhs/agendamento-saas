import type { BusinessForm, BusinessHourForm, BusinessHourWindowForm, VisualThemePreference } from "@/types/business";
import type { DurationMode } from "@/types/database";
import { getPalette } from "@/lib/palettes";
import { bookingGroupPosition, bookingGroupProductName } from "@/lib/booking-groups";
import { endTimeToMinutes, isValidSameDayTimeRange, minutesToTime, timeToMinutes } from "@/lib/time-of-day";

export const weekdayLabels = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export function normalizeSlug(value: string) {
  return value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-");
}

export function slugCandidate(value: string, attempt = 1) {
  const base = normalizeSlug(value).slice(0, 80);
  if (attempt <= 1) return base;
  const suffix = `-${attempt}`;
  return `${base.slice(0, 80 - suffix.length).replace(/-+$/g, "")}${suffix}`;
}

export function normalizeOptionalUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeVisualTheme(value: string): VisualThemePreference {
  return value === "dark" ? "dark" : "light";
}

export function validateBusinessContact(form: Pick<BusinessForm, "address" | "googleMapsUrl" | "instagramUrl" | "facebookUrl">) {
  if (form.address.trim().length > 500) return "O endereço deve ter no máximo 500 caracteres.";
  const links = [
    [form.googleMapsUrl, "Google Maps"],
    [form.instagramUrl, "Instagram"],
    [form.facebookUrl, "Facebook"],
  ] as const;
  for (const [value, label] of links) {
    if (value.trim() && !normalizeOptionalUrl(value)) return `Informe um link HTTP ou HTTPS válido para ${label}.`;
    if (value.trim().length > 2048) return `O link de ${label} deve ter no máximo 2048 caracteres.`;
  }
  return null;
}

export function validateSlug(value: string) {
  const slug = normalizeSlug(value);
  if (!slug) return "Informe uma URL personalizada.";
  if (slug.length < 3 || slug.length > 80) return "A URL deve ter entre 3 e 80 caracteres.";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return "Use apenas letras, números e hífens.";
  return null;
}

export function validateDuration(mode: DurationMode, fixedMinutes: number, group2Durations: Array<number | null>) {
  if (!(["fixed", "fixed_multiple", "group_2"] as DurationMode[]).includes(mode)) return "Modo de duração inválido.";
  if (mode !== "group_2" && (!Number.isInteger(fixedMinutes) || fixedMinutes < 5 || fixedMinutes > 1440)) return "A duração fixa deve ficar entre 5 e 1440 minutos.";
  if (mode === "group_2" && group2Durations.some((duration) => !duration || !Number.isInteger(duration) || duration < 5 || duration > 1440)) return "Defina uma duração entre 5 e 1440 minutos para cada opção do Grupo secundário.";
  return null;
}

export function validateBusinessForm(form: BusinessForm) {
  if (form.name.trim().length < 2) return "Informe o nome do negócio.";
  const slugError = validateSlug(form.slug);
  if (slugError) return slugError;
  const contactError = validateBusinessContact(form);
  if (contactError) return contactError;
  const groupsError = validateBusinessGroups(form.groups);
  if (groupsError) return groupsError;
  const hoursError = validateBusinessHours(form.hours);
  if (hoursError) return hoursError;
  return validateDuration(form.durationMode, form.fixedDurationMinutes, form.groups[1].options.map((option) => option.durationMinutes));
}

export function validateBusinessGroups(groups: BusinessForm["groups"]) {
  for (const group of groups) {
    const groupName = bookingGroupProductName(group.position);
    const complementary = group.position === bookingGroupPosition("complementary");
    if ((!complementary || group.active) && !group.label.trim()) return `Informe o nome do ${groupName}.`;
    if (complementary && group.active && !group.occupancyMode) return "Defina como o Grupo complementar ocupa a agenda.";
    if (complementary && group.intentName.trim().length > 80) return "O nome curto do Grupo complementar deve ter no máximo 80 caracteres.";
    if (group.active && group.options.length === 0) return `Adicione ao menos uma opção ao ${groupName}.`;
    if (group.options.some((option) => !option.name.trim())) return `Preencha todas as opções do ${groupName}.`;
  }
  return null;
}

export function toOnboardingPayload(form: BusinessForm) {
  return {
    name: form.name.trim(), slug: normalizeSlug(form.slug), whatsapp: form.whatsapp.trim() || null,
    address: form.address.trim() || null,
    google_maps_url: normalizeOptionalUrl(form.googleMapsUrl),
    instagram_url: normalizeOptionalUrl(form.instagramUrl),
    facebook_url: normalizeOptionalUrl(form.facebookUrl),
    groups: form.groups.filter((group) => group.position !== bookingGroupPosition("complementary") || group.active).map((group) => ({
      position: group.position, label: group.label.trim(), active: group.active, required: group.required,
      intent_name: group.intentName.trim() || null,
      occupancy_mode: group.occupancyMode,
      options: group.options.map((option, sort_order) => ({
        name: option.name.trim(),
        duration_minutes: form.durationMode === "group_2" && group.position === bookingGroupPosition("secondary") ? option.durationMinutes : null,
        sort_order,
      })),
    })),
    hours: form.hours.map((hour) => ({
      weekday: hour.weekday,
      active: hour.active && hour.windows.length > 0,
      windows: hour.windows.map((window) => ({ start_time: window.startTime, end_time: window.endTime })),
    })),
    settings: {
      duration_mode: form.durationMode,
      fixed_duration_minutes: form.fixedDurationMinutes,
      allow_multiple_blocks: form.durationMode === "fixed_multiple",
      palette: getPalette(form.paletteId),
      theme_preference: normalizeVisualTheme(form.themePreference),
    },
  };
}

export function createEmptyBusinessForm(): BusinessForm {
  return {
    name: "", slug: "", whatsapp: "", logoUrl: null, address: "",
    googleMapsUrl: "", instagramUrl: "", facebookUrl: "",
    groups: [
      { position: bookingGroupPosition("primary"), label: "Grupo principal", active: true, required: true, intentName: "", occupancyMode: null, options: [] },
      { position: bookingGroupPosition("secondary"), label: "Grupo secundário", active: true, required: true, intentName: "", occupancyMode: null, options: [] },
      { position: bookingGroupPosition("complementary"), label: "Grupo complementar", active: false, required: false, intentName: "Espaço", occupancyMode: "day", options: [] },
    ],
    hours: weekdayLabels.map((label, weekday) => ({
      weekday, label, active: weekday >= 1 && weekday <= 6,
      windows: [{ startTime: weekday === 6 ? "09:00" : "08:00", endTime: weekday === 6 ? "14:00" : "18:00" }],
    })),
    durationMode: "fixed", fixedDurationMinutes: 60, paletteId: "original", themePreference: "light",
  };
}

export function validateBusinessHours(hours: BusinessHourForm[]) {
  if (hours.length !== 7 || new Set(hours.map((hour) => hour.weekday)).size !== 7) return "Configure os sete dias da semana.";
  for (const hour of hours) {
    const sorted = [...hour.windows].sort((first, second) => timeToMinutes(first.startTime) - timeToMinutes(second.startTime));
    if (sorted.some((window) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(window.startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(window.endTime) || !isValidSameDayTimeRange(window.startTime, window.endTime))) return "O horário final deve ser posterior ao inicial.";
    if (sorted.some((window, index) => index > 0 && endTimeToMinutes(sorted[index - 1].endTime) > timeToMinutes(window.startTime))) return `Os horários de ${hour.label} não podem se sobrepor.`;
  }
  return null;
}

export function cloneBusinessHourWindows(windows: BusinessHourWindowForm[]) {
  return windows.map(({ startTime, endTime }) => ({ startTime, endTime }));
}

export function nextBusinessHourWindow(windows: BusinessHourWindowForm[]): BusinessHourWindowForm | null {
  if (!windows.length) return { startTime: "08:00", endTime: "18:00" };
  const sorted = [...windows].sort((first, second) => timeToMinutes(first.startTime) - timeToMinutes(second.startTime));
  let cursor = 8 * 60;
  for (const window of sorted) {
    const start = timeToMinutes(window.startTime);
    if (start - cursor >= 60) return { startTime: minutesToTime(cursor), endTime: minutesToTime(cursor + 60) };
    cursor = Math.max(cursor, endTimeToMinutes(window.endTime));
  }
  return cursor + 60 <= 24 * 60 ? { startTime: minutesToTime(cursor), endTime: minutesToTime(cursor + 60) } : null;
}
