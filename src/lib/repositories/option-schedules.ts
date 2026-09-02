import { createClient } from "@/lib/supabase/server";
import { bookingGroupPosition } from "@/lib/booking-groups";
import { initialOptionScheduleHours, optionSchedulePayload } from "@/lib/option-schedule-form";
import type { BusinessHourForm } from "@/types/business";
import type { BookingOptionScheduleMode } from "@/types/database";

export async function getPrimaryScheduleOption(businessId: string, optionId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("booking_options")
    .select("id, name, schedule_mode, booking_groups!inner(position)")
    .eq("business_id", businessId).eq("id", optionId)
    .eq("booking_groups.position", bookingGroupPosition("primary")).single();
  if (error) throw error;
  return data;
}

export async function getOptionSchedule(businessId: string, optionId: string) {
  const option = await getPrimaryScheduleOption(businessId, optionId);
  const supabase = await createClient();
  const [custom, business] = await Promise.all([
    supabase.from("booking_option_hours").select("weekday, active, start_time, end_time")
      .eq("business_id", businessId).eq("option_id", optionId).order("weekday").order("start_time"),
    supabase.from("business_hours").select("weekday, active, start_time, end_time")
      .eq("business_id", businessId).order("weekday").order("start_time"),
  ]);
  if (custom.error) throw custom.error;
  if (business.error) throw business.error;
  return { name: option.name, mode: option.schedule_mode,
    hours: initialOptionScheduleHours(option.schedule_mode, custom.data, business.data) };
}

export async function setOptionSchedule(businessId: string, optionId: string, mode: BookingOptionScheduleMode, hours: BusinessHourForm[]) {
  // Resolve the option against the session's tenant before invoking the RPC.
  const option = await getPrimaryScheduleOption(businessId, optionId);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_admin_booking_option_schedule", optionSchedulePayload(optionId, mode, hours));
  if (error) throw error;
  return option.name;
}
