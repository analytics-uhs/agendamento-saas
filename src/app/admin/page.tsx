import type { Metadata } from "next";
import { Dashboard } from "@/components/admin/dashboard";
import { addDays, toISO, todayInTimeZone } from "@/lib/date";
import { listAppointments } from "@/lib/repositories/appointments";
import { requireCurrentBusiness } from "@/lib/repositories/businesses";

export const metadata: Metadata = { title: "Início" };

export default async function DashboardPage() {
  const business = await requireCurrentBusiness();
  const today = todayInTimeZone();
  const appointments = await listAppointments(business.id, today, toISO(addDays(today, 7)));
  return <Dashboard businessName={business.name} today={today} appointments={appointments} />;
}
