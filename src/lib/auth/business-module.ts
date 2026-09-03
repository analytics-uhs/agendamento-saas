import "server-only";
import { notFound } from "next/navigation";
import { businessHasModule, type BusinessModule } from "@/lib/business-modules";
import { requireCurrentBusiness } from "@/lib/repositories/businesses";
import { getBusinessModules } from "@/lib/repositories/business-modules";

/** Future pages and mutations must check this before loading module data. */
export async function requireBusinessModule(module: BusinessModule) {
  const business = await requireCurrentBusiness();
  const modules = await getBusinessModules(business.id);
  if (!businessHasModule(modules, module)) notFound();
  return business;
}
