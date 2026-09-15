import "server-only";
import { requireBusinessModule } from "@/lib/auth/business-module";
import { createClient } from "@/lib/supabase/server";
import { parseReceiptTarget, parseReceipt, receiptAmount, receiptError, type OriginReceipts } from "@/lib/receipts";
import type { ActionResult } from "@/types/business";

async function context(input: unknown) {
  const business = await requireBusinessModule("management");
  const target = parseReceiptTarget(input);
  return { supabase: await createClient(), args: { p_business_id: business.id, p_source_type: target.type, p_source_id: target.id } };
}
export async function readOriginReceipts(input: unknown): Promise<OriginReceipts> {
  const { supabase, args } = await context(input);
  const result = await supabase.rpc("get_admin_origin_receipts", args);
  if (result.error) throw Error("Não foi possível consultar os recebimentos.");
  return result.data as OriginReceipts;
}
export async function registerOriginReceipt(target: unknown, input: unknown): Promise<ActionResult> {
  const { supabase, args } = await context(target);
  let value;
  try { value = parseReceipt(input); } catch (error) { return { ok: false, message: (error as Error).message }; }
  const result = await supabase.rpc("register_admin_receipt", { ...args, p_amount: value.amount, p_payment_method: value.method, p_payer_name: value.payer || null, p_receipt_key: value.key });
  return result.error ? { ok: false, message: receiptError(result.error) } : { ok: true, message: "Pagamento registrado." };
}
export async function defineBookingTotal(target: unknown, input: unknown): Promise<ActionResult> {
  const { supabase, args } = await context(target);
  let total;
  try { total = receiptAmount(input); } catch (error) { return { ok: false, message: (error as Error).message }; }
  const result = await supabase.rpc("set_admin_booking_financial_total", { ...args, p_total: total });
  return result.error ? { ok: false, message: receiptError(result.error) } : { ok: true, message: "Total devido definido." };
}
