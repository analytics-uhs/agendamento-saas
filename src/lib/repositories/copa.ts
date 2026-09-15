import "server-only";
import { requireBusinessModule } from "@/lib/auth/business-module";
import { createClient } from "@/lib/supabase/server";
import { getSaleEditor } from "@/lib/repositories/sales";
import { validCatalogId } from "@/lib/product-catalog";
import { buildCopaBookingCharges, copaError, copaQuantity, type CopaSale, type CopaType } from "@/lib/copa";
import { PAYMENT_METHODS } from "@/lib/sales";
import { addDays, todayInTimeZone, toISO } from "@/lib/date";
import type { ActionResult } from "@/types/business";

const fields = "id,status,sale_type,tab_name,revision,updated_at,customer_name,payment_method,total_amount,completed_at,created_at";
async function context() { const business = await requireBusinessModule("management"); return { business, supabase: await createClient() }; }
export async function getCopa() {
  const { business, supabase } = await context();
  const windowStart = todayInTimeZone();
  const windowEnd = toISO(addDays(windowStart, 6));
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
  const [recent, appointments, resources] = await Promise.all([
    supabase.from("sales").select(fields).eq("business_id", business.id).eq("status", "completed")
      .order("completed_at", { ascending: false }).limit(5),
    supabase.from("appointments").select("id,reservation_id,customer_name,appointment_date,start_time,status,group_1_option_id")
      .eq("business_id", business.id).gte("appointment_date", windowStart).lte("appointment_date", windowEnd)
      .order("appointment_date").order("start_time"),
    supabase.from("reservation_resources").select("reservation_id,reservation_date,start_time,status,option_name_snapshot")
      .eq("business_id", business.id).gte("reservation_date", windowStart).lte("reservation_date", windowEnd)
      .order("reservation_date").order("start_time"),
  ]);
  const loadError = recent.error ?? appointments.error ?? resources.error;
  if (loadError) throw Error("Não foi possível carregar a operação da Copa.");
  const appointmentRows = appointments.data ?? [];
  const resourceRows = resources.data ?? [];

  const reservationIds = [...new Set([
    ...appointmentRows.flatMap((row) => row.reservation_id ? [row.reservation_id] : []),
    ...resourceRows.map((row) => row.reservation_id),
  ])];
  const optionIds = [...new Set(appointmentRows.flatMap((row) => row.group_1_option_id ? [row.group_1_option_id] : []))];
  const [reservations, options] = await Promise.all([
    reservationIds.length ? supabase.from("reservations").select("id,customer_name").eq("business_id", business.id).in("id", reservationIds) : Promise.resolve({ data: [], error: null }),
    optionIds.length ? supabase.from("booking_options").select("id,name").eq("business_id", business.id).in("id", optionIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (reservations.error ?? options.error) throw Error("Não foi possível identificar os agendamentos da Copa.");

  const appointmentIds = appointmentRows.filter((row) => !row.reservation_id).map((row) => row.id);
  const canonicalReservationIds = reservationIds;
  async function loadFinancial(type: "appointment" | "reservation", ids: string[]) {
    if (!ids.length) return { totals: [], entries: [] };
    const [totals, entries] = await Promise.all([
      supabase.from("booking_financial_totals").select("source_type,source_id,total_amount").eq("business_id", business.id).eq("source_type", type).in("source_id", ids),
      supabase.from("financial_entries").select("source_type,source_id,amount,status").eq("business_id", business.id).eq("source_type", type).eq("status", "paid").in("source_id", ids),
    ]);
    if (totals.error ?? entries.error) throw Error("Não foi possível carregar os recebimentos da Agenda.");
    return {
      totals: (totals.data ?? []).map((row) => ({ ...row, source_type: type })),
      entries: (entries.data ?? []).map((row) => ({ ...row, source_type: type })),
    };
  }
  const [appointmentFinancial, reservationFinancial] = await Promise.all([
    loadFinancial("appointment", appointmentIds), loadFinancial("reservation", canonicalReservationIds),
  ]);
  const bookings = buildCopaBookingCharges({
    appointments: appointmentRows,
    resources: resourceRows,
    reservations: reservations.data,
    options: options.data,
    totals: [...appointmentFinancial.totals, ...reservationFinancial.totals],
    entries: [...appointmentFinancial.entries, ...reservationFinancial.entries],
  });
  return { tabs, recent: recent.data as CopaSale[], bookings, windowStart, windowEnd };
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
    if (!(type === "tab" && operation.payment === "") && !Object.hasOwn(PAYMENT_METHODS, operation.payment)) return { ok: false, message: "Selecione Pix, Dinheiro ou Cartão." };
    // The database, not the browser, proves whether the tab is already paid.
    const { error } = await supabase.rpc("complete_admin_copa_sale", { ...args, p_payment_method: operation.payment || null });
    return error ? { ok: false, message: copaError(error) } : { ok: true, message: "Pagamento finalizado." };
  }
  try { copaQuantity(operation.quantity); } catch { return { ok: false, message: "Use uma quantidade inteira válida." }; }
  if (!validCatalogId(operation.product)) return { ok: false, message: "Produto inválido." };
  const { error } = await supabase.rpc("set_admin_copa_item", { ...args, p_product_id: operation.product, p_quantity: operation.quantity });
  return error ? { ok: false, message: copaError(error) } : { ok: true, message: "Itens salvos." };
}
