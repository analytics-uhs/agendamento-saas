"use client";
import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/field";
import { createManualFinancialEntry } from "@/app/admin/financeiro/actions";
import { FINANCIAL_METHODS, FINANCIAL_STATUS, FINANCIAL_TYPES, parseFinancialInput, type FinancialEntry, type FinancialInput } from "@/lib/financial";
import { todayInTimeZone } from "@/lib/date";

export function FinancialForm({ onSaved, onCancel }: { onSaved: (entry: FinancialEntry) => void; onCancel: () => void }) {
  const id = useId();
  const [form, setForm] = useState<FinancialInput>({ entry_type: "income", amount: "", description: "", payment_method: "", entry_date: todayInTimeZone(), status: "paid" });
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  function field(key: keyof FinancialInput, value: string) { setForm(current => ({ ...current, [key]: value })); }
  return <form className="space-y-4" onSubmit={event => {
    event.preventDefault(); setError("");
    try { parseFinancialInput(form); } catch (err) { setError((err as Error).message); return; }
    startTransition(async () => {
      try {
        const result = await createManualFinancialEntry(form);
        if (!result.ok || !result.data) { setError(result.message); return; }
        onSaved(result.data);
      } catch { setError("Não foi possível registrar. Atualize a página e tente novamente."); }
    });
  }}>
    <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor={`${id}-type`}>Tipo</Label><Select id={`${id}-type`} value={form.entry_type} onChange={e => field("entry_type", e.target.value)}>{Object.entries(FINANCIAL_TYPES).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</Select></div>
      <div className="space-y-2"><Label htmlFor={`${id}-amount`}>Valor (R$)</Label><Input id={`${id}-amount`} required inputMode="decimal" value={form.amount} onChange={e => field("amount", e.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor={`${id}-date`}>Data</Label><Input id={`${id}-date`} type="date" required value={form.entry_date} onChange={e => field("entry_date", e.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor={`${id}-status`}>Status financeiro</Label><Select id={`${id}-status`} value={form.status} onChange={e => field("status", e.target.value)}>{Object.entries(FINANCIAL_STATUS).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</Select></div>
      <div className="space-y-2"><Label htmlFor={`${id}-method`}>Método de pagamento (opcional)</Label><Select id={`${id}-method`} value={form.payment_method} onChange={e => field("payment_method", e.target.value)}><option value="">Não informado</option>{Object.entries(FINANCIAL_METHODS).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</Select></div>
      <div className="space-y-2 sm:col-span-2"><Label htmlFor={`${id}-description`}>Descrição</Label><Input id={`${id}-description`} maxLength={500} value={form.description} onChange={e => field("description", e.target.value)} /></div>
    </fieldset>
    <p className="text-xs text-muted">Confira os dados antes de registrar. Lançamentos não podem ser editados ou excluídos nesta versão.</p>
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    <div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" disabled={pending} onClick={onCancel}>Voltar</Button><Button type="submit" disabled={pending}>{pending ? "Registrando…" : "Registrar"}</Button></div>
  </form>;
}
