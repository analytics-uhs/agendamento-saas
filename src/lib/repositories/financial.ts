import "server-only";
import { requireBusinessModule } from "@/lib/auth/business-module";
import { createClient } from "@/lib/supabase/server";
import { financialError, financialMonth, parseFinancialInput, parsePaymentTarget, type FinancialEntry } from "@/lib/financial";
import type { ActionResult } from "@/types/business";

async function context() {
  const business = await requireBusinessModule("management");
  return { business, supabase: await createClient() };
}
function entry(row: { amount: number; description: string | null; payment_method: string | null } & Record<string, unknown>) {
  return { ...row, amount: String(row.amount), description: row.description ?? "", payment_method: row.payment_method ?? "" } as FinancialEntry;
}
export async function getFinancialMonth(month?: string, page = 1) {
  const { business, supabase } = await context();
  const period = financialMonth(month);
  const currentPage = Math.max(1, Math.min(10000, Math.floor(page) || 1));
  const [rows, summary] = await Promise.all([
    supabase.from("financial_entries").select("*", { count: "exact" }).eq("business_id", business.id).gte("entry_date", period.start).lt("entry_date", period.end).order("entry_date", { ascending: false }).order("id").range((currentPage - 1) * 50, currentPage * 50 - 1),
    supabase.rpc("get_admin_financial_summary", { p_month: period.start }),
  ]);
  if (rows.error || summary.error) throw new Error("Não foi possível carregar o financeiro.");
  return { period, page: currentPage, count: rows.count ?? 0, entries: rows.data.map(entry), summary: summary.data as { income: string; expense: string; balance: string } };
}
export async function getBookingFinancialEntry(input: unknown) {
  const { business, supabase } = await context();
  const target = parsePaymentTarget(input);
  if (target.type === "appointment") {
    const result = await supabase.from("appointments").select("reservation_id").eq("id", target.id).eq("business_id", business.id).single();
    if (result.error) throw new Error("Agendamento indisponível.");
    if (result.data.reservation_id) { target.type = "reservation"; target.id = result.data.reservation_id; }
  } else {
    const result = await supabase.from("reservations").select("id").eq("id", target.id).eq("business_id", business.id).single();
    if (result.error) throw new Error("Agendamento indisponível.");
  }
  const result = await supabase.from("financial_entries").select("*").eq("business_id", business.id).eq("source_type", target.type).eq("source_id", target.id).maybeSingle();
  if (result.error) throw new Error("Não foi possível consultar o pagamento.");
  return result.data ? entry(result.data) : null;
}
export async function createFinancialEntry(input: unknown, targetInput?: unknown): Promise<ActionResult<FinancialEntry>> {
  const { supabase } = await context();
  let value, target;
  try { value = parseFinancialInput(input); target = targetInput === undefined ? null : parsePaymentTarget(targetInput); }
  catch (error) { return { ok: false, message: (error as Error).message }; }
  const result = await supabase.rpc("create_admin_financial_entry", {
    p_source_type: target?.type ?? "manual", p_source_id: target?.id ?? null,
    p_entry_type: target ? "income" : value.entry_type, p_amount: value.amount,
    p_description: target ? "Pagamento de agendamento" : value.description,
    p_payment_method: value.payment_method || null, p_entry_date: value.entry_date, p_status: value.status,
  });
  return result.error ? { ok: false, message: financialError(result.error) } : { ok: true, message: "Lançamento registrado.", data: entry(result.data) };
}
