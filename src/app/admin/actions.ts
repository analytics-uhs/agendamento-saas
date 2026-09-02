"use server";

import { revalidatePath } from "next/cache";
import { getCurrentBusiness } from "@/lib/repositories/businesses";
import { getBusinessConfiguration } from "@/lib/repositories/business-configuration";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { getPalette } from "@/lib/palettes";
import { validBookingNotice } from "@/lib/booking-notice";
import { bookingGroupPosition, bookingGroupProductName } from "@/lib/booking-groups";
import { normalizeOptionalUrl, normalizeSlug, validateBusinessContact, validateBusinessGroups, validateBusinessHours, validateDuration, validateSlug } from "@/lib/business-form";
import { getSupabaseEnvironment } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult, BusinessForm, BusinessGroupForm, BusinessHourForm, VisualThemePreference } from "@/types/business";
import type { DurationMode } from "@/types/database";

async function context() {
  const user = await requireAuthenticatedUser();
  const business = await getCurrentBusiness(user.id);
  if (!business) return null;
  return { business, supabase: await createClient() };
}

function databaseMessage(message: string, code?: string) {
  if (code === "23505" || message.includes("businesses_slug_unique")) return "Esta URL já está em uso. Escolha outra.";
  if (code === "23P01" || message.includes("business_hours_overlap")) return "Os períodos do mesmo dia não podem se sobrepor.";
  return "Não foi possível salvar agora. Tente novamente.";
}

export async function saveBusiness(input: Pick<BusinessForm, "name" | "whatsapp" | "slug" | "address" | "googleMapsUrl" | "instagramUrl" | "facebookUrl">): Promise<ActionResult> {
  const current = await context();
  if (!current) return { ok: false, message: "Estabelecimento não encontrado." };
  if (input.name.trim().length < 2) return { ok: false, message: "Informe o nome do negócio." };
  const slugError = validateSlug(input.slug);
  if (slugError) return { ok: false, message: slugError };
  const contactError = validateBusinessContact(input);
  if (contactError) return { ok: false, message: contactError };

  const { error } = await current.supabase.from("businesses").update({
    name: input.name.trim(), whatsapp: input.whatsapp.trim() || null, slug: normalizeSlug(input.slug),
    address: input.address.trim() || null,
    google_maps_url: normalizeOptionalUrl(input.googleMapsUrl),
    instagram_url: normalizeOptionalUrl(input.instagramUrl),
    facebook_url: normalizeOptionalUrl(input.facebookUrl),
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

export async function saveSchedule(input: { groups: [BusinessGroupForm, BusinessGroupForm, BusinessGroupForm]; durationMode: DurationMode; fixedDurationMinutes: number }): Promise<ActionResult<BusinessForm["groups"]>> {
  const current = await context();
  if (!current) return { ok: false, message: "Estabelecimento não encontrado." };
  const groupsError = validateBusinessGroups(input.groups);
  if (groupsError) return { ok: false, message: groupsError };
  const durationError = validateDuration(input.durationMode, input.fixedDurationMinutes, input.groups[1].options.map((option) => option.durationMinutes));
  if (durationError) return { ok: false, message: durationError };

  for (const group of input.groups) {
    const groupName = bookingGroupProductName(group.position);
    const complementary = group.position === bookingGroupPosition("complementary");
    if (complementary && !group.id && !group.active) continue;
    if (!complementary && !group.id) return { ok: false, message: `Revise o ${groupName}.` };
    const groupValues = {
      label: group.label.trim(),
      active: group.active,
      required: complementary ? false : group.required,
      sort_order: group.position,
      intent_name: complementary ? group.intentName.trim() || null : null,
      occupancy_mode: complementary ? group.occupancyMode : null,
    };
    const groupResult = group.id
      ? await current.supabase.from("booking_groups").update(groupValues).eq("id", group.id).eq("business_id", current.business.id).select("id").single()
      : await current.supabase.from("booking_groups").insert({ ...groupValues, business_id: current.business.id, position: group.position }).select("id").single();
    const groupError = groupResult.error;
    if (groupError) return { ok: false, message: databaseMessage(groupError.message, groupError.code) };
    const groupId = groupResult.data.id;

    const { data: stored, error: readError } = await current.supabase.from("booking_options").select("id").eq("group_id", groupId).eq("business_id", current.business.id);
    if (readError) return { ok: false, message: databaseMessage(readError.message, readError.code) };
    const submittedIds = new Set(group.options.flatMap((option) => option.id ? [option.id] : []));
    const removed = stored.filter((option) => !submittedIds.has(option.id)).map((option) => option.id);
    if (removed.length) {
      const { error } = await current.supabase.from("booking_options").delete().in("id", removed).eq("business_id", current.business.id);
      if (error) return { ok: false, message: databaseMessage(error.message, error.code) };
    }
    for (const [sortOrder, option] of group.options.entries()) {
      if (!option.name.trim()) return { ok: false, message: `Preencha todas as opções do ${groupName}.` };
      const values = {
        name: option.name.trim(), sort_order: sortOrder, active: true,
        duration_minutes: input.durationMode === "group_2" && group.position === bookingGroupPosition("secondary") ? option.durationMinutes : null,
      };
      const result = option.id
        ? await current.supabase.from("booking_options").update(values).eq("id", option.id).eq("business_id", current.business.id)
        : await current.supabase.from("booking_options").insert({ ...values, business_id: current.business.id, group_id: groupId });
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
  return { ok: true, message: "Configuração da agenda salva.", data: (await getBusinessConfiguration(current.business.id)).groups };
}

export async function saveBookingNotice(minutes: number): Promise<ActionResult> {
  const current = await context();
  if (!current) return { ok: false, message: "Estabelecimento não encontrado." };
  if (!validBookingNotice(minutes)) return { ok: false, message: "Selecione uma antecedência válida." };
  const { error } = await current.supabase.from("business_settings")
    .update({ minimum_booking_notice_minutes: minutes }).eq("business_id", current.business.id);
  if (error) return { ok: false, message: databaseMessage(error.message, error.code) };
  revalidatePath("/admin/horarios");
  return { ok: true, message: "Antecedência mínima salva." };
}

export async function saveHours(hours: BusinessHourForm[]): Promise<ActionResult> {
  const current = await context();
  if (!current) return { ok: false, message: "Estabelecimento não encontrado." };
  const validationError = validateBusinessHours(hours);
  if (validationError) return { ok: false, message: validationError };
  const { error } = await current.supabase.rpc("replace_business_hours", { p_hours: hours.map((hour) => ({
    weekday: hour.weekday,
    active: hour.active && hour.windows.length > 0,
    windows: hour.windows.map((window) => ({ start_time: window.startTime, end_time: window.endTime })),
  })) });
  if (error) return { ok: false, message: databaseMessage(error.message, error.code) };
  revalidatePath("/admin/horarios");
  return { ok: true, message: "Horários salvos." };
}

export async function saveAppearance(input: { paletteId: string; themePreference: VisualThemePreference }): Promise<ActionResult> {
  const current = await context();
  if (!current) return { ok: false, message: "Estabelecimento não encontrado." };
  if (!(["light", "dark"] as VisualThemePreference[]).includes(input.themePreference)) return { ok: false, message: "Preferência de tema inválida." };
  const { error } = await current.supabase.from("business_settings").update({
    palette: getPalette(input.paletteId), theme_preference: input.themePreference,
  }).eq("business_id", current.business.id);
  if (error) return { ok: false, message: databaseMessage(error.message, error.code) };
  revalidatePath("/admin/aparencia");
  return { ok: true, message: "Aparência salva." };
}
