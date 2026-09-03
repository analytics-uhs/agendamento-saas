export const PRODUCT_UNITS = { UN: "Unidade", KG: "Quilograma", G: "Grama", L: "Litro", ML: "Mililitro" } as const;
export type ProductUnit = keyof typeof PRODUCT_UNITS;
export type ProductCategory = { id: string; name: string; active: boolean };
export type Product = {
  id: string; category_id: string | null; name: string; sku: string | null; barcode: string | null;
  unit: ProductUnit; cost_price: string | number | null; sale_price: string | number;
  minimum_stock: string | number; active: boolean;
};
export type ProductInput = {
  name: string; category_id: string; sku: string; barcode: string; unit: string;
  cost_price: string; sale_price: string; minimum_stock: string; active: boolean;
};
export type CatalogFilters = { search: string; category: string; status: "all" | "active" | "inactive"; page: number };
export const CATALOG_PAGE_SIZE = 30;
export const emptyProduct: ProductInput = { name: "", category_id: "", sku: "", barcode: "", unit: "UN", cost_price: "", sale_price: "", minimum_stock: "0", active: true };

/** Decimal string to decimal string: no binary arithmetic or implicit rounding. */
export function parseCatalogDecimal(input: unknown, scale = 2, optional = false): string | null {
  if (typeof input !== "string") throw new Error("Informe um valor numérico válido.");
  const value = input.trim();
  if (!value && optional) return null;
  if (!new RegExp(`^\\d+(?:[.,]\\d{1,${scale}})?$`).test(value)) throw new Error(`Use um valor positivo com até ${scale} casas decimais, sem separador de milhar.`);
  const [whole, fraction = ""] = value.replace(",", ".").split(".");
  const integer = whole.replace(/^0+(?=\d)/, "");
  if (integer.length > 12 - scale) throw new Error("O valor informado é muito alto.");
  return `${integer}.${fraction.padEnd(scale, "0")}`;
}

export function formatCatalogBRL(value: string | number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
}
export function validCatalogId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
function text(value: unknown, max: number, label: string, required = false): string {
  if (typeof value !== "string") throw new Error(`Revise ${label}.`);
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > max) throw new Error(`${label}: informe ${required ? "de 1 a" : "até"} ${max} caracteres.`);
  return normalized;
}
export function parseCategoryInput(input: unknown) {
  if (!input || typeof input !== "object") throw new Error("Revise a categoria.");
  const data = input as Record<string, unknown>;
  if (typeof data.active !== "boolean") throw new Error("Revise o status.");
  return { name: text(data.name, 80, "Nome", true), active: data.active };
}
export function parseProductInput(input: unknown) {
  if (!input || typeof input !== "object") throw new Error("Revise o produto.");
  const data = input as Record<string, unknown>;
  const name = text(data.name, 160, "Nome", true);
  const sku = text(data.sku, 64, "SKU").toUpperCase();
  const barcode = text(data.barcode, 80, "Código de barras");
  if ([sku, barcode].some((value) => value && !/^[a-z0-9._/-]+$/i.test(value))) throw new Error("SKU e código de barras aceitam letras, números, ponto, hífen, barra e sublinhado.");
  if (typeof data.unit !== "string" || !Object.hasOwn(PRODUCT_UNITS, data.unit)) throw new Error("Selecione uma unidade válida.");
  if (typeof data.active !== "boolean") throw new Error("Revise o status.");
  if (data.category_id !== "" && !validCatalogId(data.category_id)) throw new Error("Selecione uma categoria válida.");
  return { name, sku: sku || null, barcode: barcode || null, unit: data.unit as ProductUnit,
    active: data.active, category_id: data.category_id === "" ? null : data.category_id as string,
    cost_price: parseCatalogDecimal(data.cost_price, 2, true), sale_price: parseCatalogDecimal(data.sale_price)!,
    minimum_stock: parseCatalogDecimal(data.minimum_stock, 3)! };
}
export function productToInput(product: Product): ProductInput {
  return { ...product, category_id: product.category_id ?? "", sku: product.sku ?? "", barcode: product.barcode ?? "",
    cost_price: product.cost_price == null ? "" : String(product.cost_price).replace(".", ","),
    sale_price: String(product.sale_price).replace(".", ","), minimum_stock: String(product.minimum_stock).replace(".", ",") };
}
export function parseCatalogFilters(input: Partial<Record<keyof CatalogFilters, unknown>>): CatalogFilters {
  return { search: typeof input.search === "string" ? input.search.trim().slice(0, 100) : "",
    category: validCatalogId(input.category) ? input.category : "",
    status: input.status === "active" || input.status === "inactive" ? input.status : "all",
    page: Math.max(1, Math.min(100000, Math.floor(Number(input.page) || 1))) };
}
/** Quote the PostgREST value and escape wildcard characters, not filter syntax. */
export function catalogSearchExpression(search: string): string {
  const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return ["name", "sku", "barcode"].map((field) => `${field}.ilike."${pattern}"`).join(",");
}
export function catalogError(error: { code?: string; message?: string }): string {
  if (error.code === "23505") return "Já existe uma categoria com esse nome ou um produto com esse SKU/código de barras neste negócio.";
  if (error.code === "23503" || error.message?.includes("product_category_unavailable")) return "A categoria não está disponível. Atualize a lista e escolha outra.";
  if (error.code === "42501") return "Você não tem acesso a esta operação. Atualize a página.";
  return "Não foi possível salvar. Revise os dados e tente novamente.";
}
