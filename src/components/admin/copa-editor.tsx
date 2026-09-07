"use client";
import Link from "next/link";
import { useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Trash2 } from "lucide-react";
import { openCopaSale, updateCopaSale } from "@/app/admin/copa/actions";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label, Select } from "@/components/ui/field";
import { copaTitle, copaTotal, type CopaSale } from "@/lib/copa";
import { PAYMENT_METHODS, type SaleItem } from "@/lib/sales";
import { formatCatalogBRL, type Product } from "@/lib/product-catalog";

export function CopaEditor({ sale, items, products }: { sale: CopaSale | null; items: SaleItem[]; products: Product[] }) {
  const router = useRouter();
  const [search, setSearch] = useState(""), [error, setError] = useState(""), [paying, setPaying] = useState(false), [payment, setPayment] = useState("");
  const [pending, startTransition] = useTransition();
  const id = useRef<string | null>(sale?.id ?? null);
  const [visible, optimistic] = useOptimistic(items, (current, update: { product: Product; quantity: number }) => {
    const existing = current.find(item => item.product_id === update.product.id);
    const remaining = current.filter(item => item.product_id !== update.product.id);
    return update.quantity === 0 ? remaining : [...remaining, existing ? { ...existing, quantity: update.quantity } : {
      id: update.product.id, product_id: update.product.id, quantity: update.quantity, unit_price: update.product.sale_price,
      product: { name: update.product.name, unit: update.product.unit, active: update.product.active },
    }];
  });
  const available = products.filter(product => product.active && product.unit === "UN"
    && `${product.name} ${product.sku ?? ""} ${product.barcode ?? ""}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")));
  const total = copaTotal(visible);
  function change(product: Product, quantity: number) {
    setError("");
    startTransition(async () => {
      optimistic({ product, quantity });
      try {
        id.current ??= crypto.randomUUID();
        if (!sale) {
          const opened = await openCopaSale(id.current, "quick", "");
          if (!opened.ok) { setError(opened.message); return; }
        }
        const result = await updateCopaSale(id.current, sale?.sale_type ?? "quick", sale?.revision ?? 0, { product: product.id, quantity });
        if (!result.ok) setError(result.message);
        if (!sale) router.replace(`/admin/copa/venda-rapida?id=${id.current}`);
        router.refresh();
      } catch { setError("Não foi possível salvar. Atualize a página para conferir os itens antes de tentar novamente."); router.refresh(); }
    });
  }
  return <><PageHeader title={sale ? copaTitle(sale) : "Venda rápida"} description={sale?.sale_type === "tab" ? "Itens salvos a cada alteração. Estoque e financeiro somente ao pagar." : "Adicione os produtos e finalize o pagamento."} />
    <Link href="/admin/copa" className="focus-ring mt-3 inline-flex min-h-11 items-center rounded text-sm text-primary">Voltar à Copa</Link>
    {error && <p role="alert" className="my-3 text-sm text-danger">{error}</p>}
    <div className="mt-4 grid gap-6 lg:grid-cols-2">
      <section aria-label="Buscar produto"><Label htmlFor="copa-search">Buscar produto</Label><Input id="copa-search" className="mt-2" value={search} onChange={event => setSearch(event.target.value)} placeholder="Nome ou código" />
        <div className="mt-3 grid gap-2 sm:grid-cols-2">{available.map(product => <Button key={product.id} variant="outline" className="h-auto min-h-14 justify-between whitespace-normal text-left" disabled={pending || paying} onClick={() => change(product, Number(visible.find(item => item.product_id === product.id)?.quantity ?? 0) + 1)}><span>{product.name}</span><span className="shrink-0 text-xs">{formatCatalogBRL(product.sale_price)}</span></Button>)}</div>
        {!available.length && <EmptyState className="mt-3">Nenhum produto por unidade encontrado.</EmptyState>}
      </section>
      <section aria-labelledby="copa-items"><h2 id="copa-items" className="font-semibold">Itens</h2>
        {!visible.length ? <EmptyState className="mt-3">Selecione um produto para começar.</EmptyState> : <ul className="mt-3 divide-y">{visible.map(item => {
          const product = products.find(product => product.id === item.product_id);
          return <li key={item.product_id} className="space-y-3 py-3"><div className="flex justify-between gap-3"><div><p className="font-medium">{item.product?.name ?? "Produto"}{item.product?.active === false ? " (inativo)" : ""}</p><p className="text-sm text-muted">{formatCatalogBRL(item.unit_price)} / {item.product?.unit === "UN" ? "un" : item.product?.unit}</p></div><span className="font-semibold">{formatCatalogBRL(Number(item.quantity) * Number(item.unit_price))}</span></div>
            <div className="flex items-center gap-2"><Button size="icon" variant="outline" aria-label={`Diminuir ${item.product?.name}`} disabled={pending || paying || !product} onClick={() => product && change(product, Math.max(0, Number(item.quantity) - 1))}><Minus className="h-4 w-4" /></Button><span className="min-w-10 text-center tabular-nums">{item.quantity}</span><Button size="icon" variant="outline" aria-label={`Aumentar ${item.product?.name}`} disabled={pending || paying || !product} onClick={() => product && change(product, Number(item.quantity) + 1)}><Plus className="h-4 w-4" /></Button><Button size="icon" variant="ghost" aria-label={`Remover ${item.product?.name}`} disabled={pending || paying || !product} onClick={() => product && change(product, 0)}><Trash2 className="h-4 w-4" /></Button></div>
          </li>;
        })}</ul>}
        <Card padding="md" className="mt-4 space-y-4"><div className="flex items-center justify-between"><span>Total</span><strong className="text-xl tabular-nums">{formatCatalogBRL(total)}</strong></div>
          {paying ? <form className="space-y-3" onSubmit={event => {
            event.preventDefault(); if (!sale) return; setError("");
            startTransition(async () => {
              try {
                const result = await updateCopaSale(sale.id, sale.sale_type, sale.revision, { payment });
                if (!result.ok) { setError(result.message); setPaying(false); router.refresh(); return; }
                router.push(`/admin/vendas/${sale.id}`); router.refresh();
              } catch { setError("Não foi possível confirmar o pagamento. Consulte o histórico antes de tentar novamente."); router.refresh(); }
            });
          }}><Label htmlFor="copa-payment">Forma de pagamento</Label><Select id="copa-payment" autoFocus required value={payment} disabled={pending} onChange={event => setPayment(event.target.value)}><option value="">Selecione</option>{Object.entries(PAYMENT_METHODS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select><Button type="submit" className="w-full" disabled={pending || !payment}>{pending ? "Finalizando…" : "Finalizar pagamento"}</Button><Button variant="ghost" disabled={pending} onClick={() => setPaying(false)}>Voltar aos itens</Button></form>
          : <Button className="w-full" disabled={pending || !visible.length || !sale} onClick={() => setPaying(true)}>{sale?.sale_type === "tab" ? "Fechar comanda" : "Pagar venda"}</Button>}
          <p role="status" className="text-xs text-muted">{pending ? "Salvando…" : error ? "Confira os dados antes de continuar." : sale ? "Alterações salvas no servidor." : "Adicione o primeiro produto."}</p>
        </Card>
      </section>
    </div>
  </>;
}
