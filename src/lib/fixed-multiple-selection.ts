import type { BookingSlot } from "@/types/public-booking";

function minutes(time: string) {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function time(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

export function consecutiveSelectionTimes(slots: BookingSlot[], startTime: string | null, blocks: number) {
  if (!startTime) return [];
  const first = slots.find((slot) => slot.startTime === startTime);
  if (!first) return [];
  return Array.from({ length: blocks }, (_, index) => time(minutes(startTime) + index * first.durationMinutes));
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
  const selected = consecutiveSelectionTimes(slots, currentStart, currentBlocks);
  const selectedIndex = selected.indexOf(clickedTime);
  if (selectedIndex === 0) return { startTime: null, blocks: 1, rejected: false };
  if (selectedIndex > 0) return { startTime: currentStart, blocks: selectedIndex, rejected: false };
  const first = slots.find((slot) => slot.startTime === currentStart);
  const expectedNext = first ? time(minutes(currentStart) + currentBlocks * first.durationMinutes) : null;
  if (first && clickedTime === expectedNext && currentBlocks < first.maxBlocks)
    return { startTime: currentStart, blocks: currentBlocks + 1, rejected: false };
  return { startTime: currentStart, blocks: currentBlocks, rejected: true };
}

export function fixedMultipleEndTime(startTime: string, durationMinutes: number, blocks: number) {
  return time(minutes(startTime) + durationMinutes * blocks);
}
