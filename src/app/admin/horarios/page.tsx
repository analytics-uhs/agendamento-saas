import type { Metadata } from "next";
import { BusinessHours } from "@/components/admin/business-hours";
import { getBusinessConfiguration } from "@/lib/repositories/business-configuration";
import { requireCurrentBusiness } from "@/lib/repositories/businesses";
export const metadata: Metadata = { title: "Horários" };
export default async function HoursPage() {
  const business = await requireCurrentBusiness();
  return <BusinessHours initialHours={(await getBusinessConfiguration(business.id)).hours} />;
}
