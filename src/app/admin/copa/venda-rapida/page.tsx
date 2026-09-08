import { notFound, redirect } from "next/navigation";
import { CopaEditor } from "@/components/admin/copa-editor";
import { getCopaEditor } from "@/lib/repositories/copa";
import type { CopaSale } from "@/lib/copa";
export default async function QuickSalePage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const data = await getCopaEditor(id);
  const sale = data.sale as CopaSale | null;
  if (id && (!sale || sale.sale_type !== "quick")) notFound();
  if (sale?.status === "completed") redirect(`/admin/vendas/${sale.id}`);
  return <CopaEditor {...data} sale={sale} />;
}
