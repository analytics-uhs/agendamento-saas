import type { Metadata } from "next";
import { Dashboard } from "@/components/admin/dashboard";
import { addDays, toISO, todayInTimeZone } from "@/lib/date";
import {
  getAppointmentSchedulingConfig,
  listAppointments,
} from "@/lib/repositories/appointments";
import { requireCurrentBusiness } from "@/lib/repositories/businesses";
import { listCalendarBlocks } from "@/lib/repositories/calendar-blocks";

export const metadata: Metadata = { title: "Início" };

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; new?: string }>;
}) {
  const business = await requireCurrentBusiness();
  const today = todayInTimeZone();
  const params = await searchParams;
  const operationalDate =
    typeof params.date === "string" && datePattern.test(params.date)
      ? params.date
      : today;
  const summaryEnd = toISO(addDays(today, 7));
  const [summaryAppointments, config, operationalBlocks] = await Promise.all([
    listAppointments(business.id, today, summaryEnd),
    getAppointmentSchedulingConfig(business.id),
    listCalendarBlocks(business.id, operationalDate),
  ]);
  const operationalAppointments =
    operationalDate >= today && operationalDate <= summaryEnd
      ? summaryAppointments.filter(
          (appointment) => appointment.appointmentDate === operationalDate,
        )
      : await listAppointments(business.id, operationalDate);
  return (
    <Dashboard
      businessName={business.name}
      today={today}
      summaryAppointments={summaryAppointments}
      operationalDate={operationalDate}
      operationalAppointments={operationalAppointments}
      operationalBlocks={operationalBlocks}
      config={config}
      businessActive={business.active}
      initialCreating={params.new === "1"}
    />
  );
}
