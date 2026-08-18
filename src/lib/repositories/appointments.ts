import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import type { AdminAppointment, AppointmentGroup, AppointmentSchedulingConfig, ManualAppointmentInput } from "@/types/appointments";
import type { BookingSlot } from "@/types/public-booking";

type AppointmentRepositoryError = { message: string; code?: string };

function parseSlots(value: Json): BookingSlot[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    return typeof raw.start_time === "string" && typeof raw.duration_minutes === "number" && typeof raw.max_blocks === "number"
      ? [{ startTime: raw.start_time.slice(0, 5), durationMinutes: raw.duration_minutes, maxBlocks: raw.max_blocks }]
      : [];
  });
}

export async function listAppointments(businessId: string, startDate: string, endDate = startDate): Promise<AdminAppointment[]> {
  const supabase = await createClient();
  const [appointmentsResult, groupsResult, optionsResult] = await Promise.all([
    supabase.from("appointments").select("id, customer_name, customer_whatsapp, appointment_date, start_time, end_time, duration_minutes, status, source, group_1_option_id, group_2_option_id").eq("business_id", businessId).gte("appointment_date", startDate).lte("appointment_date", endDate).order("appointment_date").order("start_time"),
    supabase.from("booking_groups").select("id, position, label, active").eq("business_id", businessId),
    supabase.from("booking_options").select("id, group_id, name").eq("business_id", businessId),
  ]);
  const error = appointmentsResult.error ?? groupsResult.error ?? optionsResult.error;
  if (error) throw new Error(`Não foi possível carregar os agendamentos: ${error.message}`);

  const groups = new Map((groupsResult.data ?? []).map((group) => [group.id, group]));
  const options = new Map((optionsResult.data ?? []).map((option) => [option.id, { ...option, group: groups.get(option.group_id) }]));
  return (appointmentsResult.data ?? []).map((appointment) => {
    const group1 = appointment.group_1_option_id ? options.get(appointment.group_1_option_id) : null;
    const group2 = appointment.group_2_option_id ? options.get(appointment.group_2_option_id) : null;
    return {
      id: appointment.id,
      customerName: appointment.customer_name,
      customerWhatsapp: appointment.customer_whatsapp,
      appointmentDate: appointment.appointment_date,
      startTime: appointment.start_time.slice(0, 5),
      endTime: appointment.end_time.slice(0, 5),
      durationMinutes: appointment.duration_minutes,
      status: appointment.status,
      source: appointment.source,
      group1: group1?.group?.active ? { label: group1.group.label, name: group1.name } : null,
      group2: group2?.group?.active ? { label: group2.group.label, name: group2.name } : null,
    };
  });
}

export async function getAppointmentSchedulingConfig(businessId: string): Promise<AppointmentSchedulingConfig> {
  const supabase = await createClient();
  const [groupsResult, optionsResult, settingsResult] = await Promise.all([
    supabase.from("booking_groups").select("id, position, label").eq("business_id", businessId).eq("active", true).order("sort_order"),
    supabase.from("booking_options").select("id, group_id, name, duration_minutes").eq("business_id", businessId).eq("active", true).order("sort_order"),
    supabase.from("business_settings").select("duration_mode, fixed_duration_minutes").eq("business_id", businessId).single(),
  ]);
  const error = groupsResult.error ?? optionsResult.error ?? settingsResult.error;
  if (error || !settingsResult.data) throw new Error(`Não foi possível carregar a configuração da agenda: ${error?.message ?? "configuração ausente"}`);

  const groups: AppointmentGroup[] = (groupsResult.data ?? []).flatMap((group) => {
    if (group.position !== 1 && group.position !== 2) return [];
    return [{
      position: group.position,
      label: group.label,
      options: (optionsResult.data ?? []).filter((option) => option.group_id === group.id).map((option) => ({
        id: option.id,
        name: option.name,
        durationMinutes: option.duration_minutes,
      })),
    }];
  });
  return {
    groups,
    durationMode: settingsResult.data.duration_mode,
    fixedDurationMinutes: settingsResult.data.fixed_duration_minutes,
  };
}

export async function getAdminAvailability(input: {
  businessSlug: string;
  date: string;
  group1OptionId: string | null;
  group2OptionId: string | null;
}): Promise<{ data: BookingSlot[]; error: AppointmentRepositoryError | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_booking_availability", {
    p_slug: input.businessSlug,
    p_date: input.date,
    p_group_1_option_id: input.group1OptionId,
    p_group_2_option_id: input.group2OptionId,
  });
  return { data: error ? [] : parseSlots(data), error };
}

export async function createAdminAppointment(input: ManualAppointmentInput): Promise<AppointmentRepositoryError | null> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_admin_appointment", {
    p_group_1_option_id: input.group1OptionId,
    p_group_2_option_id: input.group2OptionId,
    p_date: input.date,
    p_start_time: input.startTime,
    p_blocks: input.blocks,
    p_customer_name: input.customerName,
    p_customer_whatsapp: input.customerWhatsapp,
  });
  return error;
}

export async function updateAppointmentStatus(appointmentId: string, status: "completed" | "cancelled" | "no_show"): Promise<AppointmentRepositoryError | null> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_appointment_status", { p_appointment_id: appointmentId, p_status: status });
  return error;
}
