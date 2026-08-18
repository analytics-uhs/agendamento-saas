import type { Metadata } from "next";
import { BusinessPageContent } from "@/components/admin/business-page";
import { getBusinessConfiguration } from "@/lib/repositories/business-configuration";
import { requireCurrentBusiness } from "@/lib/repositories/businesses";
export const metadata: Metadata = { title: "Meu negócio" };
export default async function BusinessPage() {
  const business = await requireCurrentBusiness();
  return <BusinessPageContent initialBusiness={await getBusinessConfiguration(business.id)} />;
}
