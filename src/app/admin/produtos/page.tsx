import { ProductCatalog } from "@/components/admin/product-catalog";
import { getProductCatalog } from "@/lib/repositories/products";
import { parseCatalogFilters } from "@/lib/product-catalog";
import {requireCurrentBusiness} from "@/lib/repositories/businesses";
import {getBusinessModules} from "@/lib/repositories/business-modules";

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const filters = parseCatalogFilters(await searchParams);
  const catalog = await getProductCatalog(filters);
  const business=await requireCurrentBusiness();
  const modules=await getBusinessModules(business.id);
  return <ProductCatalog key={JSON.stringify(filters)} {...catalog} fiscalEnabled={modules.fiscal} />;
}
