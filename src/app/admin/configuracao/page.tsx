import type { Metadata } from "next";
import { ScheduleConfiguration } from "@/components/admin/schedule-configuration";
import { getBusinessConfiguration } from "@/lib/repositories/business-configuration";
import { requireCurrentBusiness } from "@/lib/repositories/businesses";
export const metadata: Metadata = { title: "Configuração da agenda" };
export default async function ConfigurationPage() {
  const business = await requireCurrentBusiness();
  return <ScheduleConfiguration initialBusiness={await getBusinessConfiguration(business.id)} />;
}
