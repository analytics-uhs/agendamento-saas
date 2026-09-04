import { parseCatalogDecimal, validCatalogId, type ProductUnit } from "@/lib/product-catalog";

export const STOCK_MOVEMENT_TYPES = {
  manual_in: "Entrada", manual_out: "Saída", adjustment_in: "Ajuste positivo",
  adjustment_out: "Ajuste negativo", loss: "Perda",
} as const;
export type ManualStockMovementType = keyof typeof STOCK_MOVEMENT_TYPES;
export type StockMovementType = ManualStockMovementType | "purchase" | "sale" | "reversal";
export type StockStatus = "normal" | "low" | "negative";
export type StockFilters = { search: string; category: string; status: "all" | StockStatus; page: number; history: string; historyPage: number };
export type StockBalance = { product_id: string; category_id: string | null; name: string; sku: string | null; barcode: string | null; unit: ProductUnit; minimum_stock: string | number; active: boolean; quantity: string | number; stock_status: StockStatus };
export type StockMovement = { id: string; product_id: string; movement_type: StockMovementType; quantity_delta: string | number; unit_cost: string | number | null; reason: string | null; source_type: string | null; reversal_of_id: string | null; occurred_at: string; created_at: string; reversed: boolean };
export type StockMovementInput = { product_id: string; movement_type: string; quantity: string; unit_cost: string; reason: string; occurred_at: string };
export const STOCK_PAGE_SIZE = 30;
export const STOCK_HISTORY_PAGE_SIZE = 30;
export const emptyStockMovement: StockMovementInput = { product_id: "", movement_type: "manual_in", quantity: "", unit_cost: "", reason: "", occurred_at: "" };

/** Interpret the form's wall clock in the product's operational timezone, not the server/browser timezone. */
export function parseStockDateTime(value: unknown): string | null {
  if (value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error("Informe uma data e hora válidas.");
  const [year,month,day,hour,minute] = value.split(/[-T:]/).map(Number);
  const desired = Date.UTC(year,month-1,day,hour,minute);
  const formatter = new Intl.DateTimeFormat("en-CA", {timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
  let instant=desired;
  for(let i=0;i<3;i++){
    const parts=Object.fromEntries(formatter.formatToParts(new Date(instant)).map(part=>[part.type,part.value]));
    const represented=Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),Number(parts.hour),Number(parts.minute));
    instant+=desired-represented;
  }
  const parts=Object.fromEntries(formatter.formatToParts(new Date(instant)).map(part=>[part.type,part.value]));
  if(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`!==value) throw new Error("Informe uma data e hora válidas.");
  return new Date(instant).toISOString();
}

export function parseStockFilters(input: Partial<Record<keyof StockFilters, unknown>>): StockFilters {
  const status = input.status === "low" || input.status === "negative" || input.status === "normal" ? input.status : "all";
  return { search: typeof input.search === "string" ? input.search.trim().slice(0,100) : "", category: validCatalogId(input.category) ? input.category : "", status,
    page: Math.max(1,Math.floor(Number(input.page)||1)), history: validCatalogId(input.history) ? input.history : "", historyPage: Math.max(1,Math.floor(Number(input.historyPage)||1)) };
}
export function parseStockMovementInput(input: unknown) {
  if (!input || typeof input !== "object") throw new Error("Revise a movimentação.");
  const data = input as Record<string,unknown>;
  if (!validCatalogId(data.product_id)) throw new Error("Selecione um produto válido.");
  if (typeof data.movement_type !== "string" || !Object.hasOwn(STOCK_MOVEMENT_TYPES,data.movement_type)) throw new Error("Selecione um tipo válido.");
  const quantity = parseCatalogDecimal(data.quantity,3);
  if (!quantity || Number(quantity)<=0) throw new Error("A quantidade deve ser maior que zero.");
  const unit_cost = parseCatalogDecimal(data.unit_cost,2,true);
  const reason = typeof data.reason === "string" ? data.reason.trim() : "";
  if (reason.length>500) throw new Error("O motivo deve ter até 500 caracteres.");
  if (["adjustment_in","adjustment_out","loss"].includes(data.movement_type) && !reason) throw new Error("Informe o motivo deste ajuste.");
  const occurred_at=parseStockDateTime(data.occurred_at);
  return { product_id:data.product_id, movement_type:data.movement_type as ManualStockMovementType, quantity, unit_cost, reason:reason||null, occurred_at };
}
export function stockDelta(type: ManualStockMovementType, quantity: string|number) { return (["manual_in","adjustment_in"] as string[]).includes(type) ? Math.abs(Number(quantity)) : -Math.abs(Number(quantity)); }
export function stockStatus(quantity: string|number, minimum: string|number): StockStatus { const q=Number(quantity), m=Number(minimum); return q<0?"negative":m>0&&q<=m?"low":"normal"; }
export function formatStockQuantity(value: string|number, unit: ProductUnit) { return `${new Intl.NumberFormat("pt-BR",{maximumFractionDigits:3}).format(Number(value))} ${unit}`; }
export function formatMovementType(type: StockMovementType) { return type==="reversal"?"Estorno":type==="purchase"?"Compra":type==="sale"?"Venda":STOCK_MOVEMENT_TYPES[type]; }
export function stockError(error: { code?: string; message?: string }) { const message=error.message??""; if (message.includes("already_reversed")||error.code==="23505") return "Esta movimentação já foi estornada."; if (message.includes("not_reversible")) return "Um estorno não pode ser estornado novamente."; if (error.code==="42501") return "Você não tem acesso a esta operação."; return "Não foi possível concluir a movimentação. Revise os dados e tente novamente."; }
