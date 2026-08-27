import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { AppointmentRepositoryError } from "@/lib/repositories/appointments";
import type { ResourceBlock, ResourceBlockInput } from "@/types/appointments";

export async function listResourceBlocks(businessId: string, date: string): Promise<ResourceBlock[]> {
  const supabase = await createClient();
  const [blocksResult, optionsResult, seriesResult] = await Promise.all([
    supabase.from("resource_blocks").select("id, option_id, series_id, occupancy_mode, block_date, start_time, end_time, reason").eq("business_id", businessId).eq("block_date", date).eq("active", true).order("start_time"),
    supabase.from("booking_options").select("id, name, duration_minutes").eq("business_id", businessId),
    supabase.from("resource_block_series").select("id, starts_on, repeat_count, active").eq("business_id", businessId),
  ]);
  const error = blocksResult.error ?? optionsResult.error ?? seriesResult.error;
  if (error) throw new Error(`Não foi possível carregar os bloqueios complementares: ${error.message}`);
  const options = new Map((optionsResult.data ?? []).map((item) => [item.id, item]));
  const series = new Map((seriesResult.data ?? []).map((item) => [item.id, item]));
  return (blocksResult.data ?? []).flatMap((block) => {
    const option = options.get(block.option_id);
    if (!option) return [];
    const recurring = block.series_id ? series.get(block.series_id) : null;
    return [{ id: block.id, blockDate: block.block_date, startTime: block.start_time?.slice(0, 5) ?? null, endTime: block.end_time?.slice(0, 5) ?? null, reason: block.reason, occupancyMode: block.occupancy_mode, option: { id: option.id, name: option.name, durationMinutes: option.duration_minutes }, series: recurring ? { id: recurring.id, startsOn: recurring.starts_on, repeatCount: recurring.repeat_count, active: recurring.active } : null }];
  });
}

export async function createResourceBlocks(input: ResourceBlockInput): Promise<AppointmentRepositoryError | null> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_admin_resource_blocks", { p_option_ids: input.optionIds, p_date: input.date, p_start_time: input.startTime, p_end_time: input.endTime, p_reason: input.reason || null, p_recurring: input.recurring, p_repeat_count: input.recurring ? input.repeatCount : null });
  return error;
}

export async function cancelResourceBlock(id: string, scope: "single" | "future"): Promise<AppointmentRepositoryError | null> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_admin_resource_block", { p_block_id: id, p_scope: scope });
  return error;
}
