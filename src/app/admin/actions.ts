"use server";

import { revalidatePath } from "next/cache";
import { getCurrentBusiness } from "@/lib/repositories/businesses";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { getPalette } from "@/lib/palettes";
import { normalizeSlug, validateDuration, validateSlug } from "@/lib/business-form";
import { getSupabaseEnvironment } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult, BusinessGroupForm, BusinessHourForm } from "@/types/business";
import type { DurationMode, ThemePreference } from "@/types/database";

async function context() {
  const user = await requireAuthenticatedUser();
  const business = await getCurrentBusiness(user.id);
  if (!business) return null;
  return { business, supabase: await createClient() };
}

function databaseMessage(message: string, code?: string) {
  if (code === "23505" || message.includes("businesses_slug_unique")) return "Esta URL já está em uso. Escolha outra.";
  return "Não foi possível salvar agora. Tente novamente.";
}

export async function saveBusiness(input: { name: string; whatsapp: string; slug: string }): Promise<ActionResult> {
  const current = await context();
  if (!current) return { ok: false, message: "Estabelecimento não encontrado." };
  if (input.name.trim().length < 2) return { ok: false, message: "Informe o nome do negócio." };
  const slugError = validateSlug(input.slug);
  if (slugError) return { ok: false, message: slugError };

  const { error } = await current.supabase.from("businesses").update({
    name: input.name.trim(), whatsapp: input.whatsapp.trim() || null, slug: normalizeSlug(input.slug),
  }).eq("id", current.business.id);
  if (error) return { ok: false, message: databaseMessage(error.message, error.code) };
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Dados do negócio salvos." };
}

export async function saveLogoUrl(url: string): Promise<ActionResult> {
  const current = await context();
  if (!current) return { ok: false, message: "Estabelecimento não encontrado." };
  const { url: supabaseUrl } = getSupabaseEnvironment();
  const parsed = new URL(url);
  const expected = `/storage/v1/object/public/business-logos/${current.business.id}/logo`;
  if (parsed.origin !== new URL(supabaseUrl).origin || parsed.pathname !== expected) return { ok: false, message: "Endereço de logo inválido." };
  const { error } = await current.supabase.from("businesses").update({ logo_url: url }).eq("id", current.business.id);
  if (error) return { ok: false, message: databaseMessage(error.message, error.code) };
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Logo atualizado." };
}

export async function saveSchedule(input: { groups: [BusinessGroupForm, BusinessGroupForm]; durationMode: DurationMode; fixedDurationMinutes: number }): Promise<ActionResult> {
  const current = await context();
  if (!current) return { ok: false, message: "Estabelecimento não encontrado." };
  const durationError = validateDuration(input.durationMode, input.fixedDurationMinutes, input.groups[1].options.map((option) => option.durationMinutes));
  if (durationError) return { ok: false, message: durationError };

  for (const group of input.groups) {
    if (!group.id || !group.label.trim()) return { ok: false, message: `Revise o Grupo ${group.position}.` };
    const { error: groupError } = await current.supabase.from("booking_groups").update({
      label: group.label.trim(), active: group.active, required: group.required, sort_order: group.position,
    }).eq("id", group.id).eq("business_id", current.business.id);
    if (groupError) return { ok: false, message: databaseMessage(groupError.message, groupError.code) };

    const { data: stored, error: readError } = await current.supabase.from("booking_options").select("id").eq("group_id", group.id).eq("business_id", current.business.id);
    if (readError) return { ok: false, message: databaseMessage(readError.message, readError.code) };
    const submittedIds = new Set(group.options.flatMap((option) => option.id ? [option.id] : []));
    const removed = stored.filter((option) => !submittedIds.has(option.id)).map((option) => option.id);
    if (removed.length) {
      const { error } = await current.supabase.from("booking_options").delete().in("id", removed).eq("business_id", current.business.id);
      if (error) return { ok: false, message: databaseMessage(error.message, error.code) };
    }
    for (const [sortOrder, option] of group.options.entries()) {
      if (!option.name.trim()) return { ok: false, message: `Preencha todas as opções do Grupo ${group.position}.` };
      const values = {
        name: option.name.trim(), sort_order: sortOrder, active: true,
        duration_minutes: input.durationMode === "group_2" && group.position === 2 ? option.durationMinutes : null,
      };
      const result = option.id
        ? await current.supabase.from("booking_options").update(values).eq("id", option.id).eq("business_id", current.business.id)
        : await current.supabase.from("booking_options").insert({ ...values, business_id: current.business.id, group_id: group.id });
      if (result.error) return { ok: false, message: databaseMessage(result.error.message, result.error.code) };
    }
  }

  const { error } = await current.supabase.from("business_settings").update({
    duration_mode: input.durationMode,
    fixed_duration_minutes: input.fixedDurationMinutes,
    allow_multiple_blocks: input.durationMode === "fixed_multiple",
  }).eq("business_id", current.business.id);
  if (error) return { ok: false, message: databaseMessage(error.message, error.code) };
  revalidatePath("/admin/configuracao");
  return { ok: true, message: "Configuração da agenda salva." };
}

export async function saveHours(hours: BusinessHourForm[]): Promise<ActionResult> {
  const current = await context();
  if (!current) return { ok: false, message: "Estabelecimento não encontrado." };
  if (hours.length !== 7 || hours.some((hour) => hour.active && hour.startTime >= hour.endTime)) return { ok: false, message: "Revise os horários de funcionamento." };
  const { error } = await current.supabase.from("business_hours").upsert(hours.map((hour) => ({
    id: hour.id, business_id: current.business.id, weekday: hour.weekday, active: hour.active,
    start_time: hour.startTime, end_time: hour.endTime,
  })), { onConflict: "business_id,weekday" });
  if (error) return { ok: false, message: databaseMessage(error.message, error.code) };
  revalidatePath("/admin/horarios");
  return { ok: true, message: "Horários salvos." };
}

export async function saveAppearance(input: { paletteId: string; themePreference: ThemePreference }): Promise<ActionResult> {
  const current = await context();
  if (!current) return { ok: false, message: "Estabelecimento não encontrado." };
  if (!(["light", "dark", "system"] as ThemePreference[]).includes(input.themePreference)) return { ok: false, message: "Preferência de tema inválida." };
  const { error } = await current.supabase.from("business_settings").update({
    palette: getPalette(input.paletteId), theme_preference: input.themePreference,
  }).eq("business_id", current.business.id);
  if (error) return { ok: false, message: databaseMessage(error.message, error.code) };
  revalidatePath("/admin/aparencia");
  return { ok: true, message: "Aparência salva." };
}
