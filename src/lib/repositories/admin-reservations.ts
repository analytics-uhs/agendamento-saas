import "server-only";

import { createClient } from "@/lib/supabase/server";
import { displayEndTime } from "@/lib/time-of-day";
import type { AdminComplementaryReservation, ManualReservationInput } from "@/types/appointments";
import type { ComplementaryAvailability } from "@/types/public-booking";
import type { Json } from "@/types/database";
import type { AppointmentRepositoryError } from "@/lib/repositories/appointments";

function object(value: Json | undefined): Record<string, Json | undefined> | null { return value && typeof value === "object" && !Array.isArray(value) ? value : null; }

export async function listAdminComplementaryReservations(businessId: string, startDate: string, endDate = startDate): Promise<AdminComplementaryReservation[]> {
  const supabase = await createClient();
  const [resourcesResult, reservationsResult] = await Promise.all([
    supabase.from("reservation_resources").select("id, reservation_id, option_id, reservation_date, start_time, end_time, occupancy_mode, status, group_name_snapshot, option_name_snapshot").eq("business_id", businessId).gte("reservation_date", startDate).lte("reservation_date", endDate).order("reservation_date").order("start_time"),
    supabase.from("reservations").select("id, customer_name, customer_whatsapp").eq("business_id", businessId),
  ]);
  const error = resourcesResult.error ?? reservationsResult.error;
  if (error) throw new Error(`Não foi possível carregar as reservas complementares: ${error.message}`);
  const reservations = new Map((reservationsResult.data ?? []).map((item) => [item.id, item]));
  return (resourcesResult.data ?? []).flatMap((resource) => {
    const reservation = reservations.get(resource.reservation_id); if (!reservation) return [];
    return [{ id: resource.id, reservationId: resource.reservation_id, optionId: resource.option_id, customerName: reservation.customer_name, customerWhatsapp: reservation.customer_whatsapp, reservationDate: resource.reservation_date, startTime: resource.start_time?.slice(0, 5) ?? null, endTime: resource.end_time ? displayEndTime(resource.end_time) : null, occupancyMode: resource.occupancy_mode, status: resource.status, groupName: resource.group_name_snapshot, optionName: resource.option_name_snapshot }];
  });
}

export async function getAdminComplementaryAvailability(input: { date: string; startTime: string | null; endTime: string | null }): Promise<{ data: ComplementaryAvailability | null; error: AppointmentRepositoryError | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_admin_complementary_availability", { p_date: input.date, p_start_time: input.startTime, p_end_time: input.endTime });
  if (error) return { data: null, error };
  const root = object(data); if (!root || !Array.isArray(root.options)) return { data: null, error: { message: "invalid_admin_complementary_availability" } };
  return { data: { configured: root.configured === true, groupName: typeof root.group_name === "string" ? root.group_name : null, intentName: typeof root.intent_name === "string" ? root.intent_name : null, occupancyMode: root.occupancy_mode === "day" || root.occupancy_mode === "time_slot" ? root.occupancy_mode : null, reservationDate: typeof root.reservation_date === "string" ? root.reservation_date : null, startTime: typeof root.start_time === "string" ? root.start_time.slice(0, 5) : null, endTime: typeof root.end_time === "string" ? displayEndTime(root.end_time) : null, options: root.options.flatMap((raw) => { const option=object(raw); return option && typeof option.option_id === "string" && typeof option.name === "string" && typeof option.available === "boolean" ? [{ id: option.option_id, name: option.name, available: option.available }] : []; }) }, error: null };
}

export async function createAdminReservation(input: ManualReservationInput): Promise<AppointmentRepositoryError | null> {
  const supabase = await createClient();
  const payload = { customer_name: input.customerName, customer_whatsapp: input.customerWhatsapp, ...(input.primary ? { primary: { group_1_option_id: input.primary.group1OptionId, group_2_option_id: input.primary.group2OptionId, date: input.primary.date, start_time: input.primary.startTime, blocks: input.primary.blocks } } : {}), ...(input.complementary ? { complementary: { option_id: input.complementary.optionId, occupancy_mode: input.complementary.occupancyMode, date: input.complementary.date, ...(input.complementary.occupancyMode === "time_slot" ? { start_time: input.complementary.startTime, end_time: input.complementary.endTime } : {}) } } : {}) };
  const { error } = await supabase.rpc("create_admin_reservation", { p_payload: payload });
  return error;
}
