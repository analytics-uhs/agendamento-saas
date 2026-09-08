import { notFound, redirect } from "next/navigation";
import { CopaEditor } from "@/components/admin/copa-editor";
import { getCopaEditor } from "@/lib/repositories/copa";
import type { CopaSale } from "@/lib/copa";
export default async function TabPage({ params }: { params: Promise<{ saleId: string }> }) {
  const { saleId } = await params;
  const data = await getCopaEditor(saleId);
  const sale = data.sale as CopaSale | null;
  if (!sale || sale.sale_type !== "tab") notFound();
  if (sale.status === "completed") redirect(`/admin/vendas/${sale.id}`);
  return <CopaEditor {...data} sale={sale} />;
}
