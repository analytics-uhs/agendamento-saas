import "server-only";
import { addDays, parseISO, toISO } from "@/lib/date";
import { calendarDaySlice } from "@/lib/calendar-day";
import { listAppointments, getBusinessHoursForDate } from "@/lib/repositories/appointments";
import { listCalendarBlocks } from "@/lib/repositories/calendar-blocks";
import { listAdminComplementaryReservations } from "@/lib/repositories/admin-reservations";
import { listResourceBlocks } from "@/lib/repositories/resource-blocks";
import type { DailyCalendarData } from "@/types/appointments";

export async function listAppointmentsForDay(businessId: string, date: string) {
  const items = await listAppointments(businessId, toISO(addDays(date, -1)), date);
  return items.flatMap((item) => { const slice = calendarDaySlice(item.appointmentDate, item.startTime, item.endTime, date); return slice ? [{ ...item, ...slice }] : []; });
}

export async function listBlocksForDay(businessId: string, date: string) {
  const items = await listCalendarBlocks(businessId, toISO(addDays(date, -1)), date);
  return items.flatMap((item) => { const slice = calendarDaySlice(item.blockDate, item.startTime, item.endTime, date); return slice ? [{ ...item, ...slice }] : []; });
}

export async function readDailyCalendar(businessId: string, date: string): Promise<DailyCalendarData> {
  const previous = toISO(addDays(parseISO(date), -1));
  const [appointments, blocks, complementary, resourceBlocks, windows] = await Promise.all([
    listAppointmentsForDay(businessId, date), listBlocksForDay(businessId, date),
    listAdminComplementaryReservations(businessId, previous, date), listResourceBlocks(businessId, previous, date),
    getBusinessHoursForDate(businessId, date),
  ]);
  return {
    appointments,
    blocks,
    complementaryReservations: complementary.filter((item) => item.reservationDate === date || item.startTime && item.endTime && calendarDaySlice(item.reservationDate, item.startTime, item.endTime, date)),
    resourceBlocks: resourceBlocks.filter((item) => item.blockDate === date || item.startTime && item.endTime && calendarDaySlice(item.blockDate, item.startTime, item.endTime, date)),
    windows,
  };
}
