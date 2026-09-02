import type { BookingSlot } from "@/types/public-booking";
import { minutesToTime, timeToMinutes } from "@/lib/time-of-day";

export function consecutiveSelectionTimes(slots: BookingSlot[], startTime: string | null, blocks: number) {
  if (!startTime) return [];
  const first = slots.find((slot) => slot.startTime === startTime);
  if (!first) return [];
  return Array.from({ length: blocks }, (_, index) => minutesToTime(timeToMinutes(startTime) + index * first.durationMinutes));
}

export function selectFixedMultipleSlot(
  slots: BookingSlot[],
  currentStart: string | null,
  currentBlocks: number,
  clickedTime: string,
) {
  const clicked = slots.find((slot) => slot.startTime === clickedTime);
  if (!clicked) return { startTime: currentStart, blocks: currentBlocks, rejected: true };
  if (!currentStart) return { startTime: clickedTime, blocks: 1, rejected: false };
  const selected = consecutiveSelectionTimes(slots, currentStart, currentBlocks).filter((time) => time >= currentStart);
  const selectedIndex = selected.indexOf(clickedTime);
  if (selectedIndex === 0) return { startTime: null, blocks: 1, rejected: false };
  if (selectedIndex > 0) return { startTime: currentStart, blocks: selectedIndex, rejected: false };
  const first = slots.find((slot) => slot.startTime === currentStart);
  const expectedNext = first ? minutesToTime(timeToMinutes(currentStart) + currentBlocks * first.durationMinutes) : null;
  if (first && timeToMinutes(currentStart) + currentBlocks * first.durationMinutes < 1440 && clickedTime === expectedNext && currentBlocks < first.maxBlocks)
    return { startTime: currentStart, blocks: currentBlocks + 1, rejected: false };
  return { startTime: currentStart, blocks: currentBlocks, rejected: true };
}

export function fixedMultipleEndTime(startTime: string, durationMinutes: number, blocks: number) {
  return minutesToTime(timeToMinutes(startTime) + durationMinutes * blocks);
}
