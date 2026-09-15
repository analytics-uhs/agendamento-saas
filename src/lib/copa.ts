import type { Sale, SaleItem } from "./sales";
import type { ReceiptTarget } from "./receipts";
import type { AppointmentStatus } from "@/types/database";
export type CopaType = "quick" | "tab";
export type CopaSale = Sale & { sale_type: CopaType; tab_name: string | null; revision: number; updated_at: string };
export type CopaBookingCharge = {
  id: string;
  target: ReceiptTarget;
  customerName: string;
  resourceName: string;
  date: string;
  startTime: string | null;
  status: Exclude<AppointmentStatus, "cancelled">;
  total: string | null;
  received: string;
  remaining: string | null;
};

type CopaBookingRows = {
  appointments: Array<{ id: string; reservation_id: string | null; customer_name: string; appointment_date: string; start_time: string; status: AppointmentStatus; group_1_option_id: string | null }>;
  resources: Array<{ reservation_id: string; reservation_date: string; start_time: string | null; status: AppointmentStatus; option_name_snapshot: string }>;
  reservations: Array<{ id: string; customer_name: string }>;
  options: Array<{ id: string; name: string }>;
  totals: Array<{ source_type: "appointment" | "reservation"; source_id: string; total_amount: string | number }>;
  entries: Array<{ source_type: "appointment" | "reservation"; source_id: string | null; amount: string | number; status: "paid" | "pending" }>;
};

function cents(value: string | number) { return Math.round(Number(value) * 100); }
function money(centsValue: number) { return (centsValue / 100).toFixed(2); }
function targetKey(target: ReceiptTarget) { return `${target.type}:${target.id}`; }

/** Builds the operational list without creating a second financial source. */
export function buildCopaBookingCharges(rows: CopaBookingRows): CopaBookingCharge[] {
  const reservations = new Map(rows.reservations.map((row) => [row.id, row]));
  const options = new Map(rows.options.map((row) => [row.id, row.name]));
  const totals = new Map(rows.totals.map((row) => [`${row.source_type}:${row.source_id}`, cents(row.total_amount)]));
  const received = new Map<string, number>();
  for (const entry of rows.entries) {
    if (!entry.source_id || entry.status !== "paid") continue;
    const key = `${entry.source_type}:${entry.source_id}`;
    received.set(key, (received.get(key) ?? 0) + cents(entry.amount));
  }

  const charges: CopaBookingCharge[] = [];
  const represented = new Set<string>();
  const activeReservationAppointments = new Set(
    rows.appointments.flatMap((row) => row.status !== "cancelled" && row.reservation_id ? [row.reservation_id] : []),
  );
  function append(input: Omit<CopaBookingCharge, "id" | "total" | "received" | "remaining">) {
    const key = targetKey(input.target);
    if (represented.has(key)) return;
    represented.add(key);
    const totalCents = totals.get(key);
    const receivedCents = received.get(key) ?? 0;
    charges.push({
      ...input,
      id: key,
      total: totalCents === undefined ? null : money(totalCents),
      received: money(receivedCents),
      remaining: totalCents === undefined ? null : money(totalCents - receivedCents),
    });
  }

  for (const appointment of rows.appointments) {
    if (appointment.status === "cancelled") continue;
    append({
      target: appointment.reservation_id
        ? { type: "reservation", id: appointment.reservation_id }
        : { type: "appointment", id: appointment.id },
      customerName: appointment.customer_name,
      resourceName: appointment.group_1_option_id ? options.get(appointment.group_1_option_id) ?? "Agendamento" : "Agendamento",
      date: appointment.appointment_date,
      startTime: appointment.start_time.slice(0, 5),
      status: appointment.status,
    });
  }
  for (const resource of rows.resources) {
    if (resource.status === "cancelled" || activeReservationAppointments.has(resource.reservation_id)) continue;
    const reservation = reservations.get(resource.reservation_id);
    if (!reservation) continue;
    append({
      target: { type: "reservation", id: resource.reservation_id },
      customerName: reservation.customer_name,
      resourceName: resource.option_name_snapshot,
      date: resource.reservation_date,
      startTime: resource.start_time?.slice(0, 5) ?? null,
      status: resource.status,
    });
  }
  return charges.sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? "").localeCompare(b.startTime ?? "") || a.resourceName.localeCompare(b.resourceName));
}
export function copaTitle(sale: Pick<CopaSale, "sale_type" | "tab_name">) {
  return sale.sale_type === "tab" ? `Comanda ${sale.tab_name}` : "Balcão";
}
export function copaQuantity(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 99999999999) throw Error("Use uma quantidade inteira, maior ou igual a zero.");
  return value;
}
export function copaTotal(items: SaleItem[]) {
  return items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unit_price), 0);
}
export function copaError(error: { message?: string }) {
  if (error.message?.includes("sale_payment_required")) return "Ainda há saldo a receber. Confira os recebimentos e escolha a forma de pagamento para fechar.";
  if (error.message?.includes("financial_total_below_received")) return "O total da comanda não pode ficar abaixo do valor já recebido.";
  if (error.message?.includes("copa_stale")) return "Esta venda mudou em outra tela. Os dados foram recarregados; confira antes de tentar novamente.";
  if (error.message?.includes("already_completed")) return "Esta venda já foi finalizada. Consulte o histórico.";
  if (error.message?.includes("integer_quantity")) return "A Copa trabalha com quantidades inteiras em un. Revise os itens legados antes de finalizar.";
  if (error.message?.includes("positive_total") || error.message?.includes("sale_empty")) return "Adicione produtos com total maior que zero antes de pagar.";
  return "Não foi possível atualizar a venda. Verifique seu acesso e os produtos e tente novamente.";
}
