"use client";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, ArrowRight } from "lucide-react";
import { openCopaSale } from "@/app/admin/copa/actions";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty-state";
import { copaTitle, type CopaSale } from "@/lib/copa";
import { PAYMENT_METHODS } from "@/lib/sales";
import { formatCatalogBRL } from "@/lib/product-catalog";

export function CopaHome({ tabs, recent }: { tabs: CopaSale[]; recent: CopaSale[] }) {
  const router = useRouter();
  const [opening, setOpening] = useState(false), [name, setName] = useState(""), [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const requestId = useRef<string | null>(null);
  return <><PageHeader title="Copa" description="Abra uma comanda ou registre uma venda rápida." />
    <div className="mt-6 flex flex-wrap gap-3"><Button onClick={() => setOpening(true)}><Plus className="h-4 w-4" />Abrir comanda</Button>
      <Link href="/admin/copa/venda-rapida" className="focus-ring inline-flex h-11 items-center rounded-xl border px-4 text-sm font-semibold hover:bg-surface">Venda rápida</Link></div>
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
    <section className="mt-8" aria-labelledby="recent-sales"><div className="flex flex-wrap items-center justify-between gap-3"><h2 id="recent-sales" className="text-lg font-semibold">Últimas vendas</h2><Link href="/admin/vendas" className="focus-ring inline-flex min-h-11 items-center gap-1 rounded text-sm font-medium text-primary">Ver histórico<ArrowRight className="h-4 w-4" /></Link></div>
      {!recent.length ? <EmptyState>Nenhuma venda finalizada.</EmptyState> : <ul className="divide-y">{recent.map(sale => <li key={sale.id}><Link href={`/admin/vendas/${sale.id}`} className="focus-ring flex flex-wrap items-center justify-between gap-3 rounded py-4"><div><p className="font-medium">{copaTitle(sale)}</p><p className="text-sm text-muted">{sale.payment_method ? PAYMENT_METHODS[sale.payment_method] : "—"}</p></div><span className="font-semibold tabular-nums">{formatCatalogBRL(sale.total_amount)}</span></Link></li>)}</ul>}
    </section>
  </>;
}
