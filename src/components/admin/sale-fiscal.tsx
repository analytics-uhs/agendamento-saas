import Link from "next/link";
import { requireCurrentBusiness } from "@/lib/repositories/businesses";
import { getBusinessModules } from "@/lib/repositories/business-modules";
import { getSaleFiscalDocument } from "@/lib/repositories/fiscal";
import { Card } from "@/components/ui/card";
import { FiscalPrepare } from "@/components/admin/fiscal-prepare";

/** Read-only boundary: fiscal failures must not prevent viewing the commercial sale. */
export async function SaleFiscal({ saleId }: { saleId: string }) {
  const business = await requireCurrentBusiness();
  let document;
  try {
    const modules = await getBusinessModules(business.id);
    if (!modules.fiscal) return null;
    document = await getSaleFiscalDocument(saleId);
  } catch {
    return <p role="status" className="mt-6 text-sm text-muted">Consulta fiscal indisponível no momento. A venda permanece finalizada.</p>;
  }
  return <Card padding="md" className="mt-6 space-y-3">
    <h2 className="font-semibold">Documento fiscal</h2>
    {document ? <Link className="focus-ring inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-primary hover:bg-surface" href={`/admin/fiscal/${document.id}`}>NFC-e preparada · Ver documento</Link> : <FiscalPrepare saleId={saleId} />}
  </Card>;
}
