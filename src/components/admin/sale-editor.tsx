import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PAYMENT_METHODS, saleSubtotal, type Sale, type SaleItem } from "@/lib/sales";
import { formatCatalogBRL } from "@/lib/product-catalog";

/** Historical read-only detail. All draft editing now uses the shared Copa editor. */
export function SaleEditor({ sale, items }: { sale: Sale; items: SaleItem[] }) {
  return <><PageHeader title="Detalhe da venda" description="Esta venda já foi baixada do estoque." action={<Badge variant="success">Finalizada</Badge>} />
    <Card padding="md" className="mt-6 space-y-5"><dl className="grid gap-4 sm:grid-cols-3">
      <div><dt className="text-xs text-muted">Identificação</dt><dd className="font-medium">{sale.tab_name ?? sale.customer_name ?? "Venda rápida"}</dd></div>
      <div><dt className="text-xs text-muted">Pagamento</dt><dd>{sale.payment_method ? PAYMENT_METHODS[sale.payment_method] : "—"}</dd></div>
      <div><dt className="text-xs text-muted">Total</dt><dd className="font-semibold">{formatCatalogBRL(sale.total_amount)}</dd></div>
      <div><dt className="text-xs text-muted">Data</dt><dd>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(sale.completed_at ?? sale.created_at))}</dd></div>
    </dl><ul className="divide-y border-y">{items.map(item => <li key={item.id} className="flex flex-wrap justify-between gap-3 py-3"><div><p className="font-medium">{item.product?.name ?? "Produto indisponível"}</p><p className="text-sm text-muted">{item.quantity} {item.product?.unit} × {formatCatalogBRL(item.unit_price)}</p></div><span className="font-semibold">{formatCatalogBRL(saleSubtotal(item.quantity, item.unit_price))}</span></li>)}</ul>
      <div className="flex flex-wrap gap-4"><Link href="/admin/copa" className="focus-ring rounded text-sm text-primary">Voltar à Copa</Link><Link href="/admin/vendas" className="focus-ring rounded text-sm text-primary">Histórico de vendas</Link></div>
    </Card></>;
}
