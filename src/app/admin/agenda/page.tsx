import { readDailyCalendar } from "@/lib/repositories/daily-calendar";
import type { Metadata } from "next";
import { DailyAgendaPage } from "@/components/admin/daily-agenda-page";
import { todayInTimeZone } from "@/lib/date";
import { getAppointmentSchedulingConfig } from "@/lib/repositories/appointments";
import { requireCurrentBusiness } from "@/lib/repositories/businesses";

export const metadata: Metadata = { title: "Agenda" };

export default async function AgendaPage() {
  const business = await requireCurrentBusiness();
  const today = todayInTimeZone();
  const [calendar, config] = await Promise.all([
    readDailyCalendar(business.id, today),
    getAppointmentSchedulingConfig(business.id),
  ]);
  const { appointments, complementaryReservations = [], blocks, resourceBlocks = [], windows } = calendar;
  return (
    <DailyAgendaPage
      initialDate={today}
      initialAppointments={appointments}
      initialComplementaryReservations={complementaryReservations}
      initialBlocks={blocks}
      initialResourceBlocks={resourceBlocks}
      initialWindows={windows}
      config={config}
      businessActive={business.active}
    />
  );
}
