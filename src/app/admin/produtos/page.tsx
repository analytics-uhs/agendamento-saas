import { ProductCatalog } from "@/components/admin/product-catalog";
import { getProductCatalog } from "@/lib/repositories/products";
import { parseCatalogFilters } from "@/lib/product-catalog";

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const filters = parseCatalogFilters(await searchParams);
  const catalog = await getProductCatalog(filters);
  return <ProductCatalog key={JSON.stringify(filters)} {...catalog} />;
}
