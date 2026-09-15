"use client";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, ArrowRight, CalendarDays, Clock3 } from "lucide-react";
import { openCopaSale } from "@/app/admin/copa/actions";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/admin/status-badge";
import { OriginPayments } from "@/components/admin/origin-payments";
import { copaTitle, type CopaBookingCharge, type CopaSale } from "@/lib/copa";
import { PAYMENT_METHODS } from "@/lib/sales";
import { formatCatalogBRL } from "@/lib/product-catalog";
import { formatShortDate } from "@/lib/date";

function financialStatus(booking: CopaBookingCharge) {
  if (booking.total === null) return <Badge size="sm">Sem total</Badge>;
  if (Number(booking.remaining) === 0) return <Badge variant="success" size="sm">Pago</Badge>;
  if (Number(booking.received) > 0) return <Badge variant="accent" size="sm">Parcial</Badge>;
  return <Badge size="sm">Pendente</Badge>;
}

export function CopaHome({ tabs, recent, bookings, windowStart }: { tabs: CopaSale[]; recent: CopaSale[]; bookings: CopaBookingCharge[]; windowStart: string; windowEnd: string }) {
  const router = useRouter();
  const [opening, setOpening] = useState(false), [name, setName] = useState(""), [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const requestId = useRef<string | null>(null);
  return <><PageHeader title="Copa" description="Abra uma comanda ou registre uma venda no balcão." />
    <div className="mt-6 flex flex-wrap gap-3"><Button onClick={() => setOpening(true)}><Plus className="h-4 w-4" />Abrir comanda</Button>
      <Link href="/admin/copa/venda-rapida" className="focus-ring inline-flex h-11 items-center rounded-xl border px-4 text-sm font-semibold hover:bg-surface">Balcão</Link></div>
    {opening && <Card padding="md" className="mt-4"><form className="space-y-3" onSubmit={event => {
      event.preventDefault(); setError(""); requestId.current ??= crypto.randomUUID();
      startTransition(async () => {
        try {
          const result = await openCopaSale(requestId.current!, "tab", name);
          if (!result.ok || !result.data) { setError(result.message); return; }
          router.push(`/admin/copa/comandas/${result.data.id}`);
        } catch { setError("Não foi possível abrir a comanda. Tente novamente."); }
      });
    }}><Label htmlFor="tab-name">Identificação *</Label><Input id="tab-name" autoFocus required maxLength={160} placeholder="Nome, mesa ou grupo" value={name} onChange={event => setName(event.target.value)} disabled={pending} />
      <div className="flex gap-2"><Button type="submit" disabled={pending}>{pending ? "Abrindo…" : "Abrir comanda"}</Button><Button variant="ghost" disabled={pending} onClick={() => setOpening(false)}>Cancelar</Button></div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}</form></Card>}
    <section className="mt-8" aria-labelledby="open-tabs"><h2 id="open-tabs" className="text-lg font-semibold">Comandas abertas</h2>
      {!tabs.length ? <EmptyState className="mt-3">Nenhuma comanda aberta.</EmptyState> : <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{tabs.map(sale => <li key={sale.id}><Link href={`/admin/copa/comandas/${sale.id}`} className="focus-ring block rounded-xl border bg-background p-4 hover:bg-surface">
        <h3 className="break-words font-semibold">{sale.tab_name}</h3><p className="mt-2 text-sm text-muted">{sale.item_count ?? 0} itens</p><p className="mt-1 text-lg font-semibold tabular-nums">{formatCatalogBRL(sale.total_amount)}</p>
      </Link></li>)}</ul>}
    </section>
    <section className="mt-8" aria-labelledby="booking-charges">
      <div><h2 id="booking-charges" className="text-lg font-semibold">Agenda</h2><p className="mt-1 text-sm text-muted">Agendamentos de hoje e dos próximos 6 dias.</p></div>
      {!bookings.length ? <EmptyState className="mt-3">Nenhum agendamento para cobrança neste período.</EmptyState> : <ul className="mt-3 grid gap-3 md:grid-cols-2">{bookings.map(booking => <li key={booking.id}>
        <Card as="article" padding="md" className="h-full">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-semibold">{booking.resourceName}</h3><p className="mt-1 truncate text-sm text-muted">{booking.customerName}</p></div><div className="flex shrink-0 flex-wrap justify-end gap-1.5">{financialStatus(booking)}<StatusBadge status={booking.status} /></div></div>
          <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted"><span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" />{booking.date === windowStart ? "Hoje" : formatShortDate(booking.date)}</span><span className="inline-flex items-center gap-1.5"><Clock3 className="h-4 w-4" />{booking.startTime ?? "Reserva do dia"}</span></p>
          <dl className="mt-4 grid grid-cols-3 gap-2 border-t pt-3 text-sm tabular-nums"><div><dt className="text-xs text-muted">Total</dt><dd className="mt-0.5 font-semibold">{booking.total === null ? "—" : formatCatalogBRL(booking.total)}</dd></div><div><dt className="text-xs text-muted">Recebido</dt><dd className="mt-0.5 font-semibold">{formatCatalogBRL(booking.received)}</dd></div><div><dt className="text-xs text-muted">Falta</dt><dd className="mt-0.5 font-semibold">{booking.remaining === null ? "—" : formatCatalogBRL(booking.remaining)}</dd></div></dl>
          <div className="mt-4"><OriginPayments key={`${booking.id}:${booking.total}:${booking.received}`} target={booking.target} initialData={{ total: booking.total, received: booking.received, remaining: booking.remaining, entries: [] }} presentation="compact" /></div>
        </Card>
      </li>)}</ul>}
    </section>
    <section className="mt-8" aria-labelledby="recent-sales"><div className="flex flex-wrap items-center justify-between gap-3"><h2 id="recent-sales" className="text-lg font-semibold">Últimas vendas</h2><Link href="/admin/vendas" className="focus-ring inline-flex min-h-11 items-center gap-1 rounded text-sm font-medium text-primary">Ver histórico<ArrowRight className="h-4 w-4" /></Link></div>
      {!recent.length ? <EmptyState>Nenhuma venda finalizada.</EmptyState> : <ul className="divide-y">{recent.map(sale => <li key={sale.id}><Link href={`/admin/vendas/${sale.id}`} className="focus-ring flex flex-wrap items-center justify-between gap-3 rounded py-4"><div><p className="font-medium">{copaTitle(sale)}</p><p className="text-sm text-muted">{sale.payment_method ? PAYMENT_METHODS[sale.payment_method] : "—"}</p></div><span className="font-semibold tabular-nums">{formatCatalogBRL(sale.total_amount)}</span></Link></li>)}</ul>}
    </section>
  </>;
}
