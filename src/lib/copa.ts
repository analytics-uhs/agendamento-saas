import type { Sale, SaleItem } from "./sales";
export type CopaType = "quick" | "tab";
export type CopaSale = Sale & { sale_type: CopaType; tab_name: string | null; revision: number; updated_at: string };
export function copaTitle(sale: Pick<CopaSale, "sale_type" | "tab_name">) {
  return sale.sale_type === "tab" ? `Comanda ${sale.tab_name}` : "Venda rápida";
}
export function copaQuantity(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 99999999999) throw Error("Use uma quantidade inteira, maior ou igual a zero.");
  return value;
}
export function copaTotal(items: SaleItem[]) {
  return items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unit_price), 0);
}
export function copaError(error: { message?: string }) {
  if (error.message?.includes("copa_stale")) return "Esta venda mudou em outra tela. Os dados foram recarregados; confira antes de tentar novamente.";
  if (error.message?.includes("already_completed")) return "Esta venda já foi finalizada. Consulte o histórico.";
  if (error.message?.includes("integer_quantity")) return "A Copa trabalha com quantidades inteiras em un. Revise os itens legados antes de finalizar.";
  if (error.message?.includes("positive_total") || error.message?.includes("sale_empty")) return "Adicione produtos com total maior que zero antes de pagar.";
  return "Não foi possível atualizar a venda. Verifique seu acesso e os produtos e tente novamente.";
}
