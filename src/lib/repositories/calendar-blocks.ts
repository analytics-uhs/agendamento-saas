import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  CalendarBlock,
  CalendarBlockInput,
} from "@/types/appointments";
import type { AppointmentRepositoryError } from "@/lib/repositories/appointments";
import { displayEndTime } from "@/lib/time-of-day";

export async function listCalendarBlocks(
  businessId: string,
  startDate: string,
  endDate = startDate,
): Promise<CalendarBlock[]> {
  const supabase = await createClient();
  const [blocksResult, groupsResult, optionsResult, seriesResult] =
    await Promise.all([
      supabase
        .from("calendar_blocks")
        .select("id, block_date, start_time, end_time, reason, group_1_option_id, series_id")
        .eq("business_id", businessId)
        .is("cancelled_at", null)
        .gte("block_date", startDate)
        .lte("block_date", endDate)
        .order("start_time"),
      supabase
        .from("booking_groups")
        .select("id, label, active")
        .eq("business_id", businessId)
        .eq("position", 1),
      supabase
        .from("booking_options")
        .select("id, group_id, name")
        .eq("business_id", businessId),
      supabase
        .from("calendar_block_series")
        .select("id, starts_on, repeat_count, active")
        .eq("business_id", businessId),
    ]);
  const error =
    blocksResult.error ??
    groupsResult.error ??
    optionsResult.error ??
    seriesResult.error;
  if (error) throw new Error(`Não foi possível carregar os bloqueios: ${error.message}`);
  const group = groupsResult.data?.[0];
  const options = new Map((optionsResult.data ?? []).map((item) => [item.id, item]));
  const series = new Map((seriesResult.data ?? []).map((item) => [item.id, item]));
  return (blocksResult.data ?? []).map((block) => {
    const option = block.group_1_option_id
      ? options.get(block.group_1_option_id)
      : null;
    const recurrence = block.series_id ? series.get(block.series_id) : null;
    return {
      id: block.id,
      blockDate: block.block_date,
      startTime: block.start_time.slice(0, 5),
      endTime: displayEndTime(block.end_time),
      reason: block.reason,
      group1:
        group?.active && option
          ? { id: option.id, label: group.label, name: option.name }
          : null,
      series: recurrence
        ? {
            id: recurrence.id,
            startsOn: recurrence.starts_on,
            repeatCount: recurrence.repeat_count,
            active: recurrence.active,
          }
        : null,
    };
  });
}

export async function createCalendarBlocks(
  input: CalendarBlockInput,
): Promise<AppointmentRepositoryError | null> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_calendar_blocks", {
    p_group_1_option_ids: input.group1OptionIds,
    p_date: input.date,
    p_start_time: input.startTime,
    p_end_time: input.endTime,
    p_reason: input.reason || null,
    p_recurring: input.recurring,
    p_repeat_count: input.recurring ? input.repeatCount : null,
  });
  return error;
}

export async function updateCalendarBlock(
  id: string,
  input: Pick<CalendarBlockInput, "date" | "startTime" | "endTime" | "reason">,
): Promise<AppointmentRepositoryError | null> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_calendar_block", {
    p_block_id: id,
    p_date: input.date,
    p_start_time: input.startTime,
    p_end_time: input.endTime,
    p_reason: input.reason || null,
  });
  return error;
}

export async function deleteCalendarBlock(
  id: string,
  scope: "single" | "future",
): Promise<AppointmentRepositoryError | null> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_calendar_block", {
    p_block_id: id,
    p_scope: scope,
  });
  return error;
}
