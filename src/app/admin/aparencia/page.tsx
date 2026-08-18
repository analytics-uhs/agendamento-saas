import type { Metadata } from "next";
import { AppearancePageContent } from "@/components/admin/appearance-page";
import { getBusinessConfiguration } from "@/lib/repositories/business-configuration";
import { requireCurrentBusiness } from "@/lib/repositories/businesses";
export const metadata: Metadata = { title: "Aparência" };
export default async function AppearancePage() {
  const business = await requireCurrentBusiness();
  return <AppearancePageContent initialBusiness={await getBusinessConfiguration(business.id)} />;
}
