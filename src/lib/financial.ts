import { parseCatalogDecimal, validCatalogId } from "@/lib/product-catalog";
import { todayInTimeZone } from "@/lib/date";
import { PAYMENT_METHODS } from "@/lib/sales";

export const FINANCIAL_METHODS = { ...PAYMENT_METHODS, other: "Outro" } as const;
export const FINANCIAL_TYPES = { income: "Entrada", expense: "Saída" } as const;
export const FINANCIAL_STATUS = { paid: "Pago", pending: "Pendente" } as const;
export const FINANCIAL_SOURCES = { manual: "Manual", sale: "Venda", appointment: "Agendamento", reservation: "Agendamento" } as const;
export type BookingPaymentTarget = { type: "appointment" | "reservation"; id: string };
export type FinancialInput = { entry_type: "income" | "expense"; amount: string; description: string; payment_method: string; entry_date: string; status: "paid" | "pending" };
export type FinancialEntry = FinancialInput & { id: string; source_type: keyof typeof FINANCIAL_SOURCES; source_id: string | null };
export function parseFinancialInput(input: unknown): FinancialInput {
  if (!input || typeof input !== "object") throw new Error("Revise o lançamento.");
  const value = input as Record<string, unknown>;
  if (value.entry_type !== "income" && value.entry_type !== "expense") throw new Error("Selecione entrada ou saída.");
  if (value.status !== "paid" && value.status !== "pending") throw new Error("Selecione pago ou pendente.");
  if (typeof value.payment_method !== "string" || (value.payment_method && !Object.hasOwn(FINANCIAL_METHODS, value.payment_method))) throw new Error("Selecione um método válido.");
  if (typeof value.description !== "string" || value.description.trim().length > 500) throw new Error("Use até 500 caracteres na descrição.");
  const date = value.entry_date;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error("Informe uma data válida.");
  const amount = parseCatalogDecimal(value.amount)!;
  if (Number(amount) <= 0) throw new Error("O valor deve ser maior que zero.");
  return { entry_type: value.entry_type, status: value.status, amount, description: value.description.trim(), payment_method: value.payment_method, entry_date: date };
}
export function parsePaymentTarget(input: unknown): BookingPaymentTarget {
  const value = input as Partial<BookingPaymentTarget> | null;
  if (!value || !["appointment", "reservation"].includes(value.type ?? "") || !validCatalogId(value.id)) throw new Error("Agendamento inválido.");
  return { type: value.type!, id: value.id };
}
export function financialMonth(value?: string) {
  const month = typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && Number(value.slice(0,4)) >= 1 && Number(value.slice(0,4)) < 9999 ? value : todayInTimeZone().slice(0, 7);
  const [year, number] = month.split("-").map(Number);
  const end = number === 12 ? `${year + 1}-01-01` : `${year}-${String(number + 1).padStart(2, "0")}-01`;
  return { month, start: `${month}-01`, end };
}
export function financialError(error: { code?: string }) {
  if (error.code === "23505") return "Já existe um lançamento para este agendamento. Atualize para visualizá-lo.";
  if (error.code === "42501") return "Você não tem acesso a esta operação.";
  return "Não foi possível registrar. Revise os dados e tente novamente.";
}
