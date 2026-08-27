"use server";

import { dispatchPendingAdminPushes, safelyRunPushEffect } from "@/lib/admin-push";
import { normalizeWhatsapp, validateWhatsapp } from "@/lib/availability";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import type { BookingConfirmation, BookingSlot, ComplementaryAvailability, PublicActionResult, PublicReservationPayload } from "@/types/public-booking";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function object(value: Json | undefined): Record<string, Json | undefined> | null { return value && typeof value === "object" && !Array.isArray(value) ? value : null; }
function validOption(value: string | null) { return value === null || uuid.test(value); }
function time(value: Json | undefined) { return typeof value === "string" ? value.slice(0, 5) : null; }

function parseSlots(value: Json): BookingSlot[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    const slot = object(raw);
    return slot && typeof slot.start_time === "string" && typeof slot.duration_minutes === "number" && typeof slot.max_blocks === "number"
      ? [{ startTime: slot.start_time.slice(0, 5), durationMinutes: slot.duration_minutes, maxBlocks: slot.max_blocks }] : [];
  });
}

function parseComplementaryAvailability(value: Json): ComplementaryAvailability | null {
  const root = object(value);
  if (!root || typeof root.configured !== "boolean" || !Array.isArray(root.options)) return null;
  const occupancyMode = root.occupancy_mode === "day" || root.occupancy_mode === "time_slot" ? root.occupancy_mode : null;
  return {
    configured: root.configured,
    groupName: typeof root.group_name === "string" ? root.group_name : null,
    intentName: typeof root.intent_name === "string" ? root.intent_name : null,
    occupancyMode,
    reservationDate: typeof root.reservation_date === "string" ? root.reservation_date : null,
    startTime: time(root.start_time), endTime: time(root.end_time),
    options: root.options.flatMap((raw) => { const option = object(raw); return option && typeof option.option_id === "string" && typeof option.name === "string" && typeof option.available === "boolean" ? [{ id: option.option_id, name: option.name, available: option.available }] : []; }),
  };
}

function parseGroup(value: Json | undefined) {
  const group = object(value);
  return group && typeof group.label === "string" && typeof group.name === "string" ? { label: group.label, name: group.name } : null;
}

function parseReservationConfirmation(value: Json): BookingConfirmation | null {
  const root = object(value); const business = object(root?.business); const primary = object(root?.primary); const complementary = object(root?.complementary);
  if (!root || !business || typeof root.date !== "string" || typeof root.customer_name !== "string" || typeof business.name !== "string" || typeof business.slug !== "string") return null;
  const mode = complementary?.occupancy_mode === "day" || complementary?.occupancy_mode === "time_slot" ? complementary.occupancy_mode : null;
  if (complementary && (!mode || typeof complementary.group_name !== "string" || typeof complementary.option_name !== "string")) return null;
  const startTime = time(primary?.start_time); const endTime = time(primary?.end_time);
  return {
    business: { name: business.name, slug: business.slug, logoUrl: typeof business.logo_url === "string" ? business.logo_url : null },
    group1: parseGroup(primary?.group_1), group2: parseGroup(primary?.group_2),
    complementary: complementary && mode ? { label: complementary.group_name as string, name: complementary.option_name as string, occupancyMode: mode, startTime: time(complementary.start_time), endTime: time(complementary.end_time) } : null,
    appointmentDate: root.date, startTime, endTime, durationMinutes: typeof primary?.duration_minutes === "number" ? primary.duration_minutes : null,
    customerName: root.customer_name,
  };
}

function publicError(message: string, code?: string): PublicActionResult<never> {
  if (message.includes("reservation_complementary_conflict")) return { ok: false, conflict: true, message: "Esse recurso acabou de ser reservado. Escolha outra opção." };
  if (message.includes("reservation_primary_conflict") || code === "23P01" || message.includes("booking_conflict")) return { ok: false, conflict: true, message: "O horário acabou de ser reservado. Escolha outro horário." };
  if (message.includes("reservation_invalid_option") || message.includes("reservation_invalid_group") || message.includes("booking_invalid_group")) return { ok: false, staleSelection: true, message: "A opção selecionada não está mais disponível. Faça uma nova escolha." };
  if (message.includes("reservation_business_unavailable") || message.includes("booking_business_unavailable")) return { ok: false, message: "Este estabelecimento não está disponível para agendamentos." };
  if (message.includes("reservation_outside_business_hours") || message.includes("reservation_invalid_interval") || message.includes("booking_business_closed") || message.includes("booking_outside_business_hours") || message.includes("booking_invalid_date")) return { ok: false, message: "A data ou horário selecionado não está mais disponível." };
  if (message.includes("reservation_invalid_whatsapp") || message.includes("booking_invalid_whatsapp")) return { ok: false, message: "Informe um WhatsApp válido com DDD." };
  if (message.includes("reservation_invalid_customer_name") || message.includes("booking_invalid_customer_name")) return { ok: false, message: "Informe seu nome." };
  return { ok: false, message: "Não foi possível concluir a reserva. Tente novamente." };
}

export async function getAvailability(input: { slug: string; date: string; group1OptionId: string | null; group2OptionId: string | null }): Promise<PublicActionResult<BookingSlot[]>> {
  if (!slugPattern.test(input.slug) || !datePattern.test(input.date) || !validOption(input.group1OptionId) || !validOption(input.group2OptionId)) return { ok: false, message: "Seleção inválida." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_booking_availability", { p_slug: input.slug, p_date: input.date, p_group_1_option_id: input.group1OptionId, p_group_2_option_id: input.group2OptionId });
  if (error) return publicError(error.message, error.code);
  return { ok: true, data: parseSlots(data) };
}

export async function getComplementaryAvailability(input: { slug: string; date: string; startTime?: string | null; endTime?: string | null }): Promise<PublicActionResult<ComplementaryAvailability>> {
  if (!slugPattern.test(input.slug) || !datePattern.test(input.date) || (input.startTime && !timePattern.test(input.startTime)) || (input.endTime && !timePattern.test(input.endTime))) return { ok: false, message: "Seleção inválida." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_complementary_availability", { p_slug: input.slug, p_date: input.date, p_start_time: input.startTime ?? null, p_end_time: input.endTime ?? null });
  if (error) return publicError(error.message, error.code);
  const availability = parseComplementaryAvailability(data);
  return availability ? { ok: true, data: availability } : { ok: false, message: "Não foi possível consultar as opções adicionais." };
}

function validPayload(payload: PublicReservationPayload) {
  const primary = payload.primary; const complementary = payload.complementary;
  return validateWhatsapp(payload.customer_whatsapp) && payload.customer_name.trim().length >= 2 && Boolean(primary || complementary)
    && (!primary || (datePattern.test(primary.date) && timePattern.test(primary.start_time) && validOption(primary.group_1_option_id) && validOption(primary.group_2_option_id) && Number.isInteger(primary.blocks) && primary.blocks > 0))
    && (!complementary || (uuid.test(complementary.option_id) && datePattern.test(complementary.date) && (complementary.occupancy_mode === "day" || (Boolean(complementary.start_time && complementary.end_time) && timePattern.test(complementary.start_time ?? "") && timePattern.test(complementary.end_time ?? "")))));
}

export async function createPublicReservation(input: { slug: string; payload: PublicReservationPayload }): Promise<PublicActionResult<BookingConfirmation>> {
  if (!slugPattern.test(input.slug) || !validPayload(input.payload)) return { ok: false, message: "Dados da reserva inválidos." };
  const payload = { ...input.payload, customer_name: input.payload.customer_name.trim(), customer_whatsapp: normalizeWhatsapp(input.payload.customer_whatsapp) };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_public_reservation", { p_slug: input.slug, p_payload: payload });
  if (error) return publicError(error.message, error.code);
  const confirmation = parseReservationConfirmation(data);
  if (!confirmation) return { ok: false, message: "A reserva foi criada, mas não foi possível exibir a confirmação." };
  await safelyRunPushEffect(async () => { await dispatchPendingAdminPushes(input.slug); });
  return { ok: true, data: confirmation };
}
