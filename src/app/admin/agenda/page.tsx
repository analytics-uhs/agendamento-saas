import type { Metadata } from "next";
import { DailyAgendaPage } from "@/components/admin/daily-agenda-page";
import { todayInTimeZone } from "@/lib/date";
import { getAppointmentSchedulingConfig, getBusinessHoursForDate, listAppointments } from "@/lib/repositories/appointments";
import { requireCurrentBusiness } from "@/lib/repositories/businesses";
import { listCalendarBlocks } from "@/lib/repositories/calendar-blocks";
import { listAdminComplementaryReservations } from "@/lib/repositories/admin-reservations";

export const metadata: Metadata = { title: "Agenda" };

export default async function AgendaPage() {
  const business = await requireCurrentBusiness();
  const today = todayInTimeZone();
  const [appointments, complementaryReservations, blocks, config, windows] = await Promise.all([
    listAppointments(business.id, today),
    listAdminComplementaryReservations(business.id, today),
    listCalendarBlocks(business.id, today),
    getAppointmentSchedulingConfig(business.id),
    getBusinessHoursForDate(business.id, today),
  ]);
  return (
    <DailyAgendaPage
      initialDate={today}
      initialAppointments={appointments}
      initialComplementaryReservations={complementaryReservations}
      initialBlocks={blocks}
      initialWindows={windows}
      config={config}
      businessActive={business.active}
    />
  );
}
