import "server-only";
import { requireBusinessModule } from "@/lib/auth/business-module";
import { createClient } from "@/lib/supabase/server";
import { CATALOG_PAGE_SIZE, catalogError, catalogSearchExpression, parseCatalogFilters, parseCategoryInput, parseProductInput, validCatalogId, type CatalogFilters, type Product, type ProductCategory } from "@/lib/product-catalog";
import type { ActionResult } from "@/types/business";

const productFields = "id, category_id, name, sku, barcode, unit, cost_price, sale_price, minimum_stock, active";
async function context() {
  const business = await requireBusinessModule("management");
  return { business, supabase: await createClient() };
}

export async function getProductCatalog(input: Partial<CatalogFilters> = {}) {
  const { business, supabase } = await context();
  const filters = parseCatalogFilters(input);
  let query = supabase.from("products").select(productFields, { count: "exact" }).eq("business_id", business.id);
  if (filters.search) query = query.or(catalogSearchExpression(filters.search));
  if (filters.category) query = query.eq("category_id", filters.category);
  if (filters.status !== "all") query = query.eq("active", filters.status === "active");
  const result = await query.order("name").order("id").range((filters.page - 1) * CATALOG_PAGE_SIZE, filters.page * CATALOG_PAGE_SIZE - 1);
  if (result.error) throw new Error("Não foi possível carregar os produtos. Tente novamente.");
  const categories: ProductCategory[] = [];
  // Fetch categories in bounded batches rather than silently truncating at the API cap.
  for (let offset = 0; ; offset += 500) {
    const categoryResult = await supabase.from("product_categories").select("id, name, active")
      .eq("business_id", business.id).order("name").order("id").range(offset, offset + 499);
    if (categoryResult.error) throw new Error("Não foi possível carregar as categorias.");
    categories.push(...categoryResult.data);
    if (categoryResult.data.length < 500) break;
  }
  return { products: result.data as Product[], categories, total: result.count ?? 0, filters };
}

export async function getProduct(id: string) {
  const { business, supabase } = await context();
  if (!validCatalogId(id)) return null;
  const { data, error } = await supabase.from("products").select(productFields).eq("business_id", business.id).eq("id", id).maybeSingle();
  if (error) throw new Error("Não foi possível carregar o produto.");
  return data;
}

export async function saveCatalogProduct(id: string | null, input: unknown): Promise<ActionResult<Product>> {
  const { business, supabase } = await context();
  if (id !== null && !validCatalogId(id)) return { ok: false, message: "Produto inválido." };
  let values: ReturnType<typeof parseProductInput>;
  try { values = parseProductInput(input); } catch (error) { return { ok: false, message: (error as Error).message }; }
  const query = id
    ? supabase.from("products").update(values).eq("business_id", business.id).eq("id", id)
    : supabase.from("products").insert({ ...values, business_id: business.id });
  const { data, error } = await query.select(productFields).maybeSingle();
  if (error) return { ok: false, message: catalogError(error) };
  if (!data) return { ok: false, message: "Produto não encontrado ou acesso indisponível. Atualize a página." };
  return { ok: true, message: id ? "Produto atualizado." : "Produto cadastrado.", data };
}

export async function saveCatalogCategory(id: string | null, input: unknown): Promise<ActionResult<ProductCategory>> {
  const { business, supabase } = await context();
  if (id !== null && !validCatalogId(id)) return { ok: false, message: "Categoria inválida." };
  let values: ReturnType<typeof parseCategoryInput>;
  try { values = parseCategoryInput(input); } catch (error) { return { ok: false, message: (error as Error).message }; }
  const query = id
    ? supabase.from("product_categories").update(values).eq("business_id", business.id).eq("id", id)
    : supabase.from("product_categories").insert({ ...values, business_id: business.id });
  const { data, error } = await query.select("id, name, active").maybeSingle();
  if (error) return { ok: false, message: catalogError(error) };
  if (!data) return { ok: false, message: "Categoria não encontrada ou acesso indisponível." };
  return { ok: true, message: id ? "Categoria atualizada." : "Categoria cadastrada.", data };
}

export async function setCatalogProductActive(id: string, active: boolean): Promise<ActionResult> {
  const { business, supabase } = await context();
  if (!validCatalogId(id) || typeof active !== "boolean") return { ok: false, message: "Produto inválido." };
  const { data, error } = await supabase.from("products").update({ active }).eq("business_id", business.id).eq("id", id).select("id").maybeSingle();
  if (error) return { ok: false, message: catalogError(error) };
  if (!data) return { ok: false, message: "Produto não encontrado ou acesso indisponível." };
  return { ok: true, message: active ? "Produto reativado." : "Produto inativado." };
}
