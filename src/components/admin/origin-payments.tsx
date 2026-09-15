"use client";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { readReceipts, registerReceipt, setBookingTotal } from "@/app/admin/financeiro/receipt-actions";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { FINANCIAL_METHODS } from "@/lib/financial";
import { formatCatalogBRL } from "@/lib/product-catalog";
import { parseReceipt, receiptAmount, splitReceiptSuggestion, type OriginReceipts, type ReceiptTarget } from "@/lib/receipts";

export function OriginPayments({ target, version, disabled = false, initialData, presentation = "detail" }: { target: ReceiptTarget; version?: number; disabled?: boolean; initialData?: OriginReceipts; presentation?: "detail" | "compact" }) {
  const id = useId();
  const [data, setData] = useState<OriginReceipts | null>(initialData ?? null), [error, setError] = useState("");
  const [notice, setNotice] = useState(""), [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(""), [payer, setPayer] = useState(""), [method, setMethod] = useState("");
  const [people, setPeople] = useState(""), [dividing, setDividing] = useState(false), [reload, setReload] = useState(0);
  const [pending, startTransition] = useTransition();
  const key = useRef<string | null>(null), busy = useRef(false);
  useEffect(() => {
    if (initialData && reload === 0) return;
    let active = true;
    readReceipts({ type: target.type, id: target.id }).then(value => { if (active) { setData(value); setError(""); } })
      .catch(() => { if (active) setError("Não foi possível atualizar os recebimentos. Tente novamente."); });
    return () => { active = false; };
  }, [target.type, target.id, version, reload, initialData]);
  const needsTotal = data?.total === null;
  function close() { if (!busy.current) { setEditing(false); document.getElementById(`${id}-open`)?.focus(); } }
  function prepare(value: OriginReceipts) {
    key.current ??= crypto.randomUUID();
    setAmount(value.total === null ? "" : value.remaining!);
    if (value.total !== null && Number(value.remaining) <= 0) { setNotice("Total recebido."); return; }
    setEditing(true); setError(""); setNotice("");
  }
  function open() {
    if (!data || presentation === "compact") {
      startTransition(async () => {
        try { const fresh = await readReceipts(target); setData(fresh); prepare(fresh); }
        catch { setError("Não foi possível atualizar os recebimentos. Tente novamente."); }
      });
      return;
    }
    prepare(data);
  }
  return <section aria-label="Recebimentos" className={presentation === "detail" ? "mt-4 space-y-3 border-t pt-4" : "space-y-2"}>
    {presentation === "detail" && <h3 className="font-semibold">Recebimentos</h3>}
    {data ? <>
      {presentation === "detail" && <dl className="grid grid-cols-3 gap-3 text-sm tabular-nums">
        <div><dt className="text-muted">Total</dt><dd className="break-words font-semibold">{data.total === null ? "Não definido" : formatCatalogBRL(data.total)}</dd></div>
        <div><dt className="text-muted">Recebido</dt><dd className="break-words font-semibold">{formatCatalogBRL(data.received)}</dd></div>
        <div><dt className="text-muted">Restante</dt><dd className="break-words font-semibold">{data.remaining === null ? "—" : formatCatalogBRL(data.remaining)}</dd></div>
      </dl>}
      {presentation === "detail" && (data.entries.length ? <ul className="divide-y text-sm">{data.entries.map(entry => <li key={entry.id} className="flex flex-wrap justify-between gap-2 py-2"><div className="min-w-0"><p className="break-words">{entry.payer_name || "Pagador não informado"}</p><p className="text-xs text-muted">{entry.payment_method ? FINANCIAL_METHODS[entry.payment_method as keyof typeof FINANCIAL_METHODS] : "Método não informado"} · {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(entry.paid_at))}{entry.status === "pending" ? " · Pendente (não recebido)" : ""}</p></div><span className="tabular-nums">{formatCatalogBRL(entry.amount)}</span></li>)}</ul> : <p className="text-sm text-muted">Nenhum recebimento registrado.</p>)}
      {needsTotal || Number(data.remaining) > 0 ? <Button id={`${id}-open`} type="button" variant="outline" disabled={disabled || pending} onClick={open}>{pending ? "Atualizando…" : needsTotal ? "Definir total devido" : presentation === "compact" ? "Receber" : "Registrar pagamento"}</Button> : presentation === "detail" ? <p className="text-sm text-success">Total recebido.</p> : null}
    </> : !error && <p role="status" className="text-sm text-muted">Consultando recebimentos…</p>}
    {notice && <p role="status" className="text-sm text-success">{notice}</p>}
    {error && !editing && <div role="alert" className="space-y-2 text-sm text-danger"><p>{error}</p><Button variant="outline" onClick={() => setReload(value => value + 1)}>Atualizar recebimentos</Button></div>}
    {editing && data && <Modal title={needsTotal ? "Total devido do agendamento" : "Registrar pagamento"} onClose={close}>
      <form className="space-y-4 p-4 sm:p-5" onSubmit={event => {
        event.preventDefault(); event.stopPropagation(); if (busy.current) return; setError("");
        try { if (needsTotal) receiptAmount(amount); else { parseReceipt({ key: key.current, amount, method, payer }); if (Number(receiptAmount(amount)) > Number(data.remaining)) throw Error("O valor não pode superar o saldo restante."); } }
        catch (err) { setError((err as Error).message); return; }
        busy.current = true;
        startTransition(async () => {
          try {
            const result = needsTotal ? await setBookingTotal(target, amount) : await registerReceipt(target, { key: key.current, amount, method, payer });
            if (!result.ok) { setError(result.message); return; }
            key.current = null; setNotice(result.message); setEditing(false); setPayer(""); setMethod(""); setDividing(false); setReload(value => value + 1); document.getElementById(`${id}-open`)?.focus();
          } catch { setError("Não foi possível confirmar a resposta. Atualize os recebimentos antes de tentar novamente; seus dados foram mantidos."); }
          finally { busy.current = false; }
        });
      }}>
        <p className="text-sm text-muted">{needsTotal ? "Informe o total devido antes do primeiro recebimento. Esse valor ficará fixo nesta versão e não altera a reserva." : `Saldo restante: ${formatCatalogBRL(data.remaining!)}. ${target.type === "sale" ? "O recebimento não altera o status da venda." : "O recebimento não altera o status da reserva."}`}</p>
        <fieldset disabled={pending} className="space-y-4">
          <div className="space-y-2"><Label htmlFor={`${id}-amount`}>{needsTotal ? "Total devido (R$)" : "Valor (R$)"}</Label><Input id={`${id}-amount`} autoFocus required inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} /></div>
          {!needsTotal && <>
            <div className="space-y-2"><Label htmlFor={`${id}-payer`}>Pagador (opcional)</Label><Input id={`${id}-payer`} maxLength={160} value={payer} onChange={event => setPayer(event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor={`${id}-method`}>Forma de pagamento</Label><Select id={`${id}-method`} required value={method} onChange={event => setMethod(event.target.value)}><option value="">Selecione</option>{Object.entries(FINANCIAL_METHODS).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</Select></div>
            <Button variant="ghost" type="button" aria-expanded={dividing} onClick={() => setDividing(value => !value)}>Dividir saldo</Button>
            {dividing && <div className="space-y-2"><Label htmlFor={`${id}-people`}>Quantidade de pessoas</Label><Input id={`${id}-people`} type="number" min={1} step={1} value={people} onChange={event => setPeople(event.target.value)} /><Button type="button" variant="outline" onClick={() => { try { setAmount(splitReceiptSuggestion(data.remaining!, Number(people))); setError(""); } catch (err) { setError((err as Error).message); } }}>Usar sugestão</Button><p className="text-xs text-muted">O valor continua editável. O último recebimento pode usar o restante exato.</p></div>}
          </>}
        </fieldset>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" disabled={pending} onClick={close}>Voltar</Button><Button type="submit" disabled={pending}>{pending ? "Registrando…" : needsTotal ? "Definir total" : "Registrar pagamento"}</Button></div>
      </form>
    </Modal>}
  </section>;
}
