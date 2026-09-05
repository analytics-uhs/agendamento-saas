import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { listFiscalDocuments } from "@/lib/repositories/fiscal";
import { FISCAL_BADGES, FISCAL_STATUSES, fiscalDate } from "@/lib/fiscal";
import { formatCatalogBRL } from "@/lib/product-catalog";

export default async function FiscalPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const params = await searchParams;
  const { documents, count, page } = await listFiscalDocuments(Number(params.page ?? 1));
  return <>
    <PageHeader title="Fiscal" description="Acompanhe os documentos fiscais das suas vendas." />
    <div className="mt-6">
      {!documents.length ? <EmptyState size="lg">
        <p className="font-semibold text-foreground">Nenhum documento fiscal preparado.</p>
        <p className="mt-2">Documentos fiscais preparados a partir das vendas aparecerão aqui.</p>
      </EmptyState> : <Card><ul className="divide-y">
        {documents.map(document => <li key={document.id}>
          <Link href={`/admin/fiscal/${document.id}`} className="focus-ring grid gap-2 rounded-xl p-4 hover:bg-surface sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_4rem_8rem_auto] sm:items-center">
            <span className="text-sm tabular-nums">{fiscalDate(document.prepared_at)}</span>
            <span className="text-sm font-medium">Venda #{document.sale_id.slice(0, 8)}</span>
            <span className="text-sm">NFC-e</span>
            <span className="font-semibold tabular-nums">{formatCatalogBRL(document.total_amount)}</span>
            <Badge variant={FISCAL_BADGES[document.status]}>{FISCAL_STATUSES[document.status]}</Badge>
          </Link>
        </li>)}
      </ul></Card>}
      {(page > 1 || count > page * 50) && <nav aria-label="Páginas dos documentos fiscais" className="mt-4 flex flex-wrap justify-between gap-3 text-sm">
        {page > 1 && <Link className="focus-ring rounded-xl border px-4 py-3 hover:bg-surface" href={`/admin/fiscal?page=${page - 1}`}>Anterior</Link>}
        {count > page * 50 && <Link className="focus-ring rounded-xl border px-4 py-3 hover:bg-surface" href={`/admin/fiscal?page=${page + 1}`}>Próxima</Link>}
      </nav>}
    </div>
  </>;
}
