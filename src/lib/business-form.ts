import type { BusinessForm } from "@/types/business";
import type { DurationMode } from "@/types/database";
import { getPalette } from "@/lib/palettes";

export const weekdayLabels = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export function normalizeSlug(value: string) {
  return value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-");
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
  if (mode === "group_2" && group2Durations.some((duration) => !duration || !Number.isInteger(duration) || duration < 5 || duration > 1440)) return "Defina uma duração entre 5 e 1440 minutos para cada opção do Grupo 2.";
  return null;
}

export function validateBusinessForm(form: BusinessForm) {
  if (form.name.trim().length < 2) return "Informe o nome do negócio.";
  const slugError = validateSlug(form.slug);
  if (slugError) return slugError;
  for (const group of form.groups) {
    if (!group.label.trim()) return `Informe o nome do Grupo ${group.position}.`;
    if (group.active && group.options.length === 0) return `Adicione ao menos uma opção ao Grupo ${group.position}.`;
    if (group.options.some((option) => !option.name.trim())) return `Preencha todas as opções do Grupo ${group.position}.`;
  }
  if (form.hours.length !== 7) return "Configure os sete dias da semana.";
  if (form.hours.some((hour) => hour.active && hour.startTime >= hour.endTime)) return "O horário final deve ser posterior ao inicial.";
  return validateDuration(form.durationMode, form.fixedDurationMinutes, form.groups[1].options.map((option) => option.durationMinutes));
}

export function toOnboardingPayload(form: BusinessForm) {
  return {
    name: form.name.trim(), slug: normalizeSlug(form.slug), whatsapp: form.whatsapp.trim() || null,
    groups: form.groups.map((group) => ({
      position: group.position, label: group.label.trim(), active: group.active, required: group.required,
      options: group.options.map((option, sort_order) => ({
        name: option.name.trim(),
        duration_minutes: form.durationMode === "group_2" && group.position === 2 ? option.durationMinutes : null,
        sort_order,
      })),
    })),
    hours: form.hours.map((hour) => ({ weekday: hour.weekday, active: hour.active, start_time: hour.startTime, end_time: hour.endTime })),
    settings: {
      duration_mode: form.durationMode,
      fixed_duration_minutes: form.fixedDurationMinutes,
      allow_multiple_blocks: form.durationMode === "fixed_multiple",
      palette: getPalette(form.paletteId),
      theme_preference: form.themePreference,
    },
  };
}

export function createEmptyBusinessForm(): BusinessForm {
  return {
    name: "", slug: "", whatsapp: "", logoUrl: null,
    groups: [
      { position: 1, label: "Grupo 1", active: true, required: true, options: [] },
      { position: 2, label: "Grupo 2", active: true, required: true, options: [] },
    ],
    hours: weekdayLabels.map((label, weekday) => ({
      weekday, label, active: weekday >= 1 && weekday <= 6,
      startTime: weekday === 6 ? "09:00" : "08:00", endTime: weekday === 6 ? "14:00" : "18:00",
    })),
    durationMode: "fixed", fixedDurationMinutes: 60, paletteId: "original", themePreference: "system",
  };
}
