import "server-only";
import { requireBusinessModule } from "@/lib/auth/business-module";
import { createClient } from "@/lib/supabase/server";
import { getSaleEditor } from "@/lib/repositories/sales";
import { validCatalogId } from "@/lib/product-catalog";
import { copaError, copaQuantity, type CopaSale, type CopaType } from "@/lib/copa";
import { PAYMENT_METHODS } from "@/lib/sales";
import type { ActionResult } from "@/types/business";

const fields = "id,status,sale_type,tab_name,revision,updated_at,customer_name,payment_method,total_amount,completed_at,created_at";
async function context() { const business = await requireBusinessModule("management"); return { business, supabase: await createClient() }; }
export async function getCopa() {
  const { business, supabase } = await context();
  // Fetch every open tab without silently truncating at PostgREST's row limit.
  const tabs: CopaSale[] = [];
  for (let from = 0; ; from += 500) {
    const result = await supabase.from("sales").select(`${fields},sale_items(count)`)
      .eq("business_id", business.id).eq("sale_type", "tab").eq("status", "draft")
      .order("updated_at", { ascending: false }).order("id").range(from, from + 499);
    if (result.error) throw Error("Não foi possível carregar as comandas.");
    tabs.push(...result.data.map(row => ({ ...row, item_count: row.sale_items[0]?.count ?? 0 })) as CopaSale[]);
    if (result.data.length < 500) break;
  }
  const recent = await supabase.from("sales").select(fields).eq("business_id", business.id).eq("status", "completed")
    .order("completed_at", { ascending: false }).limit(5);
  if (recent.error) throw Error("Não foi possível carregar as últimas vendas.");
  return { tabs, recent: recent.data as CopaSale[] };
}
export async function getCopaEditor(id?: string) {
  // Reuse the product/item loader, not a second catalogue or sales reader.
  return getSaleEditor(id);
}
export async function openCopa(id: string, type: CopaType, name: string): Promise<ActionResult<{ id: string }>> {
  const { business, supabase } = await context();
  if (!validCatalogId(id) || !["quick", "tab"].includes(type) || typeof name !== "string" || name.trim().length > 160 || (type === "tab" && !name.trim())) return { ok: false, message: "Informe uma identificação de até 160 caracteres." };
  const { data, error } = await supabase.rpc("open_admin_copa_sale", { p_business_id: business.id, p_sale_id: id, p_sale_type: type, p_tab_name: type === "tab" ? name.trim() : null });
  return error ? { ok: false, message: copaError(error) } : { ok: true, message: "Venda aberta.", data: { id: data } };
}
export async function mutateCopa(id: string, type: CopaType, revision: number, operation: { product: string; quantity: number } | { payment: string }): Promise<ActionResult> {
  const { business, supabase } = await context();
  if (!validCatalogId(id) || !["quick", "tab"].includes(type) || !Number.isSafeInteger(revision) || revision < 0 || !operation || typeof operation !== "object") return { ok: false, message: "Venda inválida." };
  const args = { p_business_id: business.id, p_sale_id: id, p_sale_type: type, p_revision: revision };
  if ("payment" in operation) {
    if (!Object.hasOwn(PAYMENT_METHODS, operation.payment)) return { ok: false, message: "Selecione Pix, Dinheiro ou Cartão." };
    const { error } = await supabase.rpc("complete_admin_copa_sale", { ...args, p_payment_method: operation.payment });
    return error ? { ok: false, message: copaError(error) } : { ok: true, message: "Pagamento finalizado." };
  }
  try { copaQuantity(operation.quantity); } catch { return { ok: false, message: "Use uma quantidade inteira válida." }; }
  if (!validCatalogId(operation.product)) return { ok: false, message: "Produto inválido." };
  const { error } = await supabase.rpc("set_admin_copa_item", { ...args, p_product_id: operation.product, p_quantity: operation.quantity });
  return error ? { ok: false, message: copaError(error) } : { ok: true, message: "Itens salvos." };
}
