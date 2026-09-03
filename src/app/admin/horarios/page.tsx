import type { Metadata } from "next";
import { BusinessHours } from "@/components/admin/business-hours";
import { getBusinessConfiguration } from "@/lib/repositories/business-configuration";
import { requireCurrentBusiness } from "@/lib/repositories/businesses";
export const metadata: Metadata = { title: "Horários" };
export default async function HoursPage() {
  const business = await requireCurrentBusiness();
  const config = await getBusinessConfiguration(business.id);
  return <BusinessHours initialHours={config.hours} initialNotice={config.minimumBookingNoticeMinutes ?? 60} initialStartOrder={config.publicBookingStartOrder ?? "service_first"} />;
}
