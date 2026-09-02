import { consecutiveSelectionTimes, selectFixedMultipleSlot } from "@/lib/fixed-multiple-selection";
import type { BookingSlot } from "@/types/public-booking";

/** Revalidate against the latest Admin candidates, using the public toggle rule. */
export function revalidateAdminTimeSelection(slots: BookingSlot[], startTime: string | null, blocks: number, multiple: boolean) {
  if (!startTime || !slots.some((slot) => slot.startTime === startTime)) return { startTime: null, blocks: 1 };
  let valid = { startTime: startTime as string | null, blocks: 1 };
  if (!multiple) return valid;
  for (const time of consecutiveSelectionTimes(slots, startTime, blocks).slice(1)) {
    const next = selectFixedMultipleSlot(slots, valid.startTime, valid.blocks, time);
    if (next.rejected) break;
    valid = { startTime: next.startTime, blocks: next.blocks };
  }
  return valid;
}
