"use server";

import { createClient } from "@/lib/supabase/server";
import { normalizeWhatsapp, validateWhatsapp } from "@/lib/availability";
import type { BookingConfirmation, BookingSlot, PublicActionResult } from "@/types/public-booking";
import type { Json } from "@/types/database";
import { dispatchPendingAdminPushes, safelyRunPushEffect } from "@/lib/admin-push";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function validOption(value: string | null) {
  return value === null || uuid.test(value);
}

function parseSlots(value: Json): BookingSlot[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    return typeof raw.start_time === "string" && typeof raw.duration_minutes === "number" && typeof raw.max_blocks === "number"
      ? [{ startTime: raw.start_time.slice(0, 5), durationMinutes: raw.duration_minutes, maxBlocks: raw.max_blocks }]
      : [];
  });
}

function parseConfirmation(value: Json): BookingConfirmation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const business = value.business;
  if (!business || typeof business !== "object" || Array.isArray(business) || typeof business.name !== "string" || typeof business.slug !== "string") return null;
  const parseGroup = (group: Json | undefined) => group && typeof group === "object" && !Array.isArray(group) && typeof group.label === "string" && typeof group.name === "string" ? { label: group.label, name: group.name } : null;
  if (typeof value.appointment_date !== "string" || typeof value.start_time !== "string" || typeof value.end_time !== "string" || typeof value.duration_minutes !== "number" || typeof value.customer_name !== "string") return null;
  return {
    business: { name: business.name, slug: business.slug, logoUrl: typeof business.logo_url === "string" ? business.logo_url : null },
    group1: parseGroup(value.group_1),
    group2: parseGroup(value.group_2),
    appointmentDate: value.appointment_date,
    startTime: value.start_time.slice(0, 5),
    endTime: value.end_time.slice(0, 5),
    durationMinutes: value.duration_minutes,
    customerName: value.customer_name,
  };
}

function publicError(message: string, code?: string): PublicActionResult<never> {
  if (code === "23P01" || message.includes("booking_conflict")) return { ok: false, conflict: true, message: "Este horário acabou de ser reservado. Escolha outro horário disponível." };
  if (message.includes("booking_business_unavailable")) return { ok: false, message: "Este estabelecimento não está disponível para agendamentos." };
  if (message.includes("booking_invalid_group")) return { ok: false, staleSelection: true, message: "A opção selecionada não está mais disponível. Faça uma nova escolha." };
  if (message.includes("booking_group_2_duration") || message.includes("booking_invalid_duration") || message.includes("booking_invalid_blocks")) return { ok: false, message: "A configuração de duração deste estabelecimento está inconsistente." };
  if (message.includes("booking_invalid_whatsapp")) return { ok: false, message: "Informe um WhatsApp válido com DDD." };
  if (message.includes("booking_invalid_customer_name")) return { ok: false, message: "Informe seu nome." };
  if (message.includes("booking_business_closed") || message.includes("booking_outside_business_hours") || message.includes("booking_invalid_date")) return { ok: false, message: "A data ou horário selecionado não está mais disponível." };
  return { ok: false, message: "Não foi possível concluir o agendamento. Tente novamente." };
}

export async function getAvailability(input: {
  slug: string; date: string; group1OptionId: string | null; group2OptionId: string | null;
}): Promise<PublicActionResult<BookingSlot[]>> {
  if (!slugPattern.test(input.slug) || !datePattern.test(input.date) || !validOption(input.group1OptionId) || !validOption(input.group2OptionId)) return { ok: false, message: "Seleção inválida." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_booking_availability", {
    p_slug: input.slug,
    p_date: input.date,
    p_group_1_option_id: input.group1OptionId,
    p_group_2_option_id: input.group2OptionId,
  });
  if (error) return publicError(error.message, error.code);
  return { ok: true, data: parseSlots(data) };
}

export async function createPublicBooking(input: {
  slug: string; group1OptionId: string | null; group2OptionId: string | null;
  date: string; startTime: string; blocks: number; customerName: string; customerWhatsapp: string;
}): Promise<PublicActionResult<BookingConfirmation>> {
  if (!slugPattern.test(input.slug) || !datePattern.test(input.date) || !timePattern.test(input.startTime) || !validOption(input.group1OptionId) || !validOption(input.group2OptionId) || !Number.isInteger(input.blocks) || input.blocks < 1) return { ok: false, message: "Dados do agendamento inválidos." };
  if (input.customerName.trim().length < 2) return { ok: false, message: "Informe seu nome." };
  if (!validateWhatsapp(input.customerWhatsapp)) return { ok: false, message: "Informe um WhatsApp válido com DDD." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_public_appointment", {
    p_slug: input.slug,
    p_group_1_option_id: input.group1OptionId,
    p_group_2_option_id: input.group2OptionId,
    p_date: input.date,
    p_start_time: input.startTime,
    p_blocks: input.blocks,
    p_customer_name: input.customerName.trim(),
    p_customer_whatsapp: normalizeWhatsapp(input.customerWhatsapp),
  });
  if (error) return publicError(error.message, error.code);
  const confirmation = parseConfirmation(data);
  if (!confirmation) return { ok: false, message: "O agendamento foi criado, mas não foi possível exibir a confirmação." };

  await safelyRunPushEffect(async () => {
    await dispatchPendingAdminPushes(input.slug);
  });
  return { ok: true, data: confirmation };
}
