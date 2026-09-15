import { FINANCIAL_METHODS } from "./financial";
import { parseCatalogDecimal, validCatalogId } from "./product-catalog";

export type ReceiptTarget = { type: "sale" | "appointment" | "reservation"; id: string };
export type OriginReceipts = {
  total: string | null; received: string; remaining: string | null;
  entries: { id: string; amount: string; payment_method: string | null; payer_name: string | null; paid_at: string; status: "paid" | "pending" }[];
};
export function parseReceiptTarget(input: unknown): ReceiptTarget {
  const value = input as Partial<ReceiptTarget> | null;
  if (!value || !["sale", "appointment", "reservation"].includes(value.type ?? "") || !validCatalogId(value.id)) throw Error("Origem do pagamento inválida.");
  return { type: value.type!, id: value.id };
}
export function receiptAmount(input: unknown) {
  const amount = parseCatalogDecimal(input)!;
  if (Number(amount) <= 0) throw Error("Informe um valor maior que zero.");
  return amount;
}
export function parseReceipt(input: unknown) {
  const value = input as Record<string, unknown> | null;
  if (!value || !validCatalogId(value.key)) throw Error("Reabra o formulário para registrar o pagamento.");
  if (typeof value.method !== "string" || !Object.hasOwn(FINANCIAL_METHODS, value.method)) throw Error("Selecione a forma de pagamento.");
  if (typeof value.payer !== "string" || value.payer.trim().length > 160) throw Error("Use até 160 caracteres para o pagador.");
  return { key: value.key, amount: receiptAmount(value.amount), method: value.method, payer: value.payer.trim() };
}
/** Suggestion only, in integer cents; the remainder is never persisted here. */
export function splitReceiptSuggestion(remaining: string, people: number) {
  if (!Number.isSafeInteger(people) || people < 1) throw Error("Informe uma quantidade inteira de pessoas.");
  const normalized = receiptAmount(remaining);
  const [whole, fraction = ""] = normalized.split(".");
  const cents = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
  const share = cents / BigInt(people);
  if (share < BigInt(1)) throw Error("A sugestão deve ser de pelo menos R$ 0,01.");
  return `${share / BigInt(100)}.${String(share % BigInt(100)).padStart(2, "0")}`;
}
export function receiptError(error: { message?: string }) {
  if (error.message?.includes("total_below_received")) return "O total da comanda não pode ficar abaixo do valor já recebido.";
  if (error.message?.includes("exceeds_remaining")) return "O valor supera o saldo restante. Atualize os recebimentos e confira o valor.";
  if (error.message?.includes("total_required")) return "Informe o total devido antes do primeiro recebimento.";
  if (error.message?.includes("total_immutable")) return "O total devido já foi definido e não pode ser alterado nesta versão.";
  if (error.message?.includes("unauthorized")) return "Você não tem acesso a esta operação.";
  if (error.message?.includes("key_mismatch")) return "Esta tentativa já foi registrada com outros dados. Atualize os recebimentos antes de continuar.";
  return "Não foi possível registrar. Confira os dados e tente novamente.";
}
