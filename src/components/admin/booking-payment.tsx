"use client";
import { useContext, useEffect, useState } from "react";
import { readBookingPayment } from "@/app/admin/financeiro/actions";
import { ManagementAccess } from "./management-access";
import { FinancialForm } from "./financial-form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FINANCIAL_METHODS, FINANCIAL_STATUS, type BookingPaymentTarget, type FinancialEntry } from "@/lib/financial";
import { formatCatalogBRL } from "@/lib/product-catalog";
import { formatNumericDate } from "@/lib/date";

export function BookingPayment({ target }: { target: BookingPaymentTarget }) {
  const enabled = useContext(ManagementAccess);
  return enabled ? <Payment key={`${target.type}:${target.id}`} target={target} /> : null;
}
function Payment({ target }: { target: BookingPaymentTarget }) {
  const [entry, setEntry] = useState<FinancialEntry | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    readBookingPayment({ type: target.type, id: target.id }).then(value => { if (active) setEntry(value); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [target.type, target.id]);
  return <section aria-label="Pagamento do agendamento" className="mt-4 space-y-3 border-t pt-4">
    {error ? <p role="alert" className="text-sm text-danger">Não foi possível consultar o pagamento. Reabra o detalhe para tentar novamente.</p> : entry === undefined ? <p role="status" className="text-sm text-muted">Consultando pagamento…</p> : entry ? <div role="status" className="space-y-2 text-sm"><p className="font-semibold">{entry.status === "paid" ? "Pagamento registrado" : "Lançamento pendente registrado"}</p><p>{formatCatalogBRL(entry.amount)} · {formatNumericDate(entry.entry_date)} · {entry.payment_method ? FINANCIAL_METHODS[entry.payment_method as keyof typeof FINANCIAL_METHODS] : "Método não informado"}</p><Badge variant={entry.status === "paid" ? "success" : "neutral"}>{FINANCIAL_STATUS[entry.status]}</Badge></div> : editing ? <FinancialForm target={target} onSaved={setEntry} onCancel={() => setEditing(false)} /> : <Button variant="outline" onClick={() => setEditing(true)}>Registrar pagamento</Button>}
  </section>;
}
