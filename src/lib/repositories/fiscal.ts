import "server-only";
import { requireBusinessModule } from "@/lib/auth/business-module";
import { createClient } from "@/lib/supabase/server";
import { validCatalogId } from "@/lib/product-catalog";
import { fiscalError, type FiscalDocument, type FiscalDocumentItem } from "@/lib/fiscal";
import type { ActionResult } from "@/types/business";

async function context() {
  const business = await requireBusinessModule("fiscal");
  return { business, supabase: await createClient() };
}
// PostgREST casts retain database numeric precision; no monetary writes from JS.
const documentFields = "id,business_id,sale_id,document_type,status,total_amount::text,provider,provider_document_id,access_key,document_number,series,protocol,xml_url,pdf_url,error_code,error_message,prepared_at,submitted_at,authorized_at,rejected_at,cancelled_at,created_by,created_at,updated_at";
export async function listFiscalDocuments(page = 1) {
  const { business, supabase } = await context();
  const currentPage = Math.max(1, Math.min(10000, Math.floor(page) || 1));
  const result = await supabase.from("fiscal_documents").select(documentFields, { count: "exact" })
    .eq("business_id", business.id).order("created_at", { ascending: false }).order("id")
    .range((currentPage - 1) * 50, currentPage * 50 - 1);
  if (result.error) throw new Error("Não foi possível carregar os documentos fiscais.");
  return { documents: result.data as FiscalDocument[], count: result.count ?? 0, page: currentPage };
}
export async function getFiscalDocument(id: string) {
  const { business, supabase } = await context();
  if (!validCatalogId(id)) return null;
  const result = await supabase.from("fiscal_documents").select(documentFields)
    .eq("business_id", business.id).eq("id", id).maybeSingle();
  if (result.error) throw new Error("Não foi possível carregar o documento fiscal.");
  if (!result.data) return null;
  const items = await supabase.from("fiscal_document_items")
    .select("id,business_id,fiscal_document_id,sale_item_id,product_id,description,quantity::text,unit_price::text,total_amount::text,created_at")
    .eq("business_id", business.id).eq("fiscal_document_id", id).order("created_at").order("id");
  if (items.error) throw new Error("Não foi possível carregar os itens fiscais.");
  return { document: result.data as FiscalDocument, items: items.data as FiscalDocumentItem[] };
}
export async function getSaleFiscalDocument(saleId: string) {
  const { business, supabase } = await context();
  if (!validCatalogId(saleId)) return null;
  const result = await supabase.from("fiscal_documents").select("id,status")
    .eq("business_id", business.id).eq("sale_id", saleId).eq("document_type", "nfce").maybeSingle();
  if (result.error) throw new Error("Não foi possível consultar a NFC-e preparada.");
  return result.data;
}
export async function prepareFiscalDocument(saleId: unknown): Promise<ActionResult<{ id: string }>> {
  const { business, supabase } = await context();
  if (!validCatalogId(saleId)) return { ok: false, message: "Venda inválida." };
  const result = await supabase.rpc("prepare_admin_fiscal_document", { p_business_id: business.id, p_sale_id: saleId });
  return result.error ? { ok: false, message: fiscalError(result.error) }
    : { ok: true, message: "NFC-e preparada localmente. Nenhuma emissão foi realizada.", data: { id: result.data.id } };
}
