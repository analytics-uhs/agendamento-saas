import type { BadgeVariant } from "@/components/ui/badge";

export const FISCAL_STATUSES = {
  draft: "Rascunho", pending: "Pendente", processing: "Processando",
  authorized: "Autorizada", rejected: "Rejeitada", cancelled: "Cancelada",
} as const;
export type FiscalStatus = keyof typeof FISCAL_STATUSES;
export const FISCAL_BADGES: Record<FiscalStatus, BadgeVariant> = {
  draft: "neutral", pending: "accent", processing: "accent",
  authorized: "success", rejected: "danger", cancelled: "neutral",
};
export type FiscalDocument = {
  id: string; business_id: string; sale_id: string; document_type: "nfce"; status: FiscalStatus;
  total_amount: string; provider: string | null; provider_document_id: string | null;
  access_key: string | null; document_number: string | null; series: string | null;
  protocol: string | null; xml_url: string | null; pdf_url: string | null;
  error_code: string | null; error_message: string | null;
  prepared_at: string | null; submitted_at: string | null; authorized_at: string | null;
  rejected_at: string | null; cancelled_at: string | null; created_by: string | null;
  created_at: string; updated_at: string;
};
export type FiscalDocumentItem = {
  id: string; business_id: string; fiscal_document_id: string; sale_item_id: string;
  product_id: string; description: string; quantity: string; unit_price: string;
  total_amount: string; created_at: string;
};
export function fiscalError(error: { code?: string; message?: string }) {
  if (error.code === "42501") return "Documento ou venda indisponível para este negócio.";
  if (error.message?.includes("fiscal_sale_not_completed")) return "Finalize a venda antes de preparar a NFC-e.";
  if (error.message?.includes("fiscal_sale_empty")) return "A venda não possui itens para preparar a NFC-e.";
  if (error.message?.includes("fiscal_total_mismatch")) return "O total da venda não confere com os itens. A NFC-e não foi preparada.";
  return "Não foi possível preparar a NFC-e. Tente novamente.";
}
export function fiscalDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value)) : "—";
}
