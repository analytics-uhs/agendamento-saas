import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getFiscalDocument } from "@/lib/repositories/fiscal";
import { FISCAL_BADGES, FISCAL_STATUSES, fiscalDate } from "@/lib/fiscal";
import { formatCatalogBRL } from "@/lib/product-catalog";
import {getFiscalEmissionView} from "@/lib/repositories/fiscal-emission";
import {FiscalEmissionForm} from "@/components/admin/fiscal-emission-form";

export default async function FiscalDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getFiscalDocument(id);
  if (!data) notFound();
  const { document, items } = data;
  const emission=await getFiscalEmissionView(id);
  const metadata = [
    ["Tipo", "NFC-e"], ["Valor total", formatCatalogBRL(document.total_amount)],
    ["Preparação", fiscalDate(document.prepared_at)], ["Provedor", document.provider],
    ["Chave", document.access_key], ["Número", document.document_number],
    ["Série", document.series], ["Protocolo", document.protocol],
  ];
  return <>
    <PageHeader title="Documento fiscal" description="NFC-e em homologação — sem validade fiscal." action={<Badge variant={FISCAL_BADGES[document.status]}>{FISCAL_STATUSES[document.status]}{document.status==="authorized"?" em homologação":""}</Badge>} />
    <Card padding="md" className="mt-6 space-y-6">
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metadata.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 break-words text-sm font-medium">{value || "—"}</dd></div>)}
      </dl>
      <p className="text-sm">Venda relacionada: <Link className="focus-ring rounded text-primary underline underline-offset-4" href={`/admin/vendas/${document.sale_id}`}>#{document.sale_id.slice(0, 8)}</Link></p>
      {document.error_message&&<p role="status" className="text-sm text-danger">{document.error_message}</p>}
      <div className="flex flex-wrap gap-4 text-sm">{[["XML",document.xml_url],["DANFCe",document.pdf_url]].map(([label,url])=>url&&/^https:\/\/homologacao\.focusnfe\.com\.br\//.test(url)?<a key={label} href={url} target="_blank" rel="noopener noreferrer" className="focus-ring rounded text-primary underline">{label}</a>:null)}</div>
      <FiscalEmissionForm id={id} status={document.status} {...emission}/>
      <section aria-labelledby="fiscal-items">
        <h2 id="fiscal-items" className="font-semibold">Itens preparados</h2>
        <ul className="mt-3 divide-y border-y">
          {items.map(item => <li key={item.id} className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_7rem_8rem_8rem]">
            <span className="min-w-0 break-words text-sm font-medium">{item.description}</span>
            <div><span className="block text-xs text-muted">Quantidade</span><span className="text-sm tabular-nums">{item.quantity.replace(".", ",")}</span></div>
            <div><span className="block text-xs text-muted">Valor unitário</span><span className="text-sm tabular-nums">{formatCatalogBRL(item.unit_price)}</span></div>
            <div><span className="block text-xs text-muted">Total</span><span className="text-sm font-semibold tabular-nums">{formatCatalogBRL(item.total_amount)}</span></div>
          </li>)}
        </ul>
      </section>
      <Link href="/admin/fiscal" className="focus-ring inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-semibold hover:bg-surface">Voltar para documentos</Link>
    </Card>
  </>;
}
