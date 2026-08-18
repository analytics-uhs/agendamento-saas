import type { Metadata } from "next";
import { AgendaPageContent } from "@/components/admin/agenda-page";
import { todayInTimeZone } from "@/lib/date";
import { getAppointmentSchedulingConfig, listAppointments } from "@/lib/repositories/appointments";
import { requireCurrentBusiness } from "@/lib/repositories/businesses";

export const metadata: Metadata = { title: "Agenda" };

export default async function AgendaPage() {
  const business = await requireCurrentBusiness();
  const today = todayInTimeZone();
  const [appointments, config] = await Promise.all([
    listAppointments(business.id, today),
    getAppointmentSchedulingConfig(business.id),
  ]);
  return <AgendaPageContent initialDate={today} initialAppointments={appointments} config={config} />;
}
