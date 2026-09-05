import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { FinancialNewEntry } from "@/components/admin/financial-new-entry";
import { getFinancialMonth } from "@/lib/repositories/financial";
import { FINANCIAL_METHODS, FINANCIAL_SOURCES, FINANCIAL_STATUS } from "@/lib/financial";
import { formatCatalogBRL } from "@/lib/product-catalog";
import { formatNumericDate } from "@/lib/date";

export default async function FinancialPage({ searchParams }: { searchParams: Promise<{ month?: string; page?: string }> }) {
  const query = await searchParams;
  const data = await getFinancialMonth(query.month, Number(query.page));
  return <>
    <PageHeader title="Financeiro" description="Acompanhe entradas e saídas do negócio." action={<FinancialNewEntry />} />
    <form className="mt-6 flex flex-wrap items-end gap-3"><div className="space-y-2"><Label htmlFor="financial-month">Mês</Label><Input id="financial-month" name="month" type="month" defaultValue={data.period.month} required /></div><Button type="submit" variant="outline">Consultar</Button></form>
    <div className="mt-6 grid gap-3 sm:grid-cols-3">{[["Entradas",data.summary.income],["Saídas",data.summary.expense],["Saldo",data.summary.balance]].map(([label,value]) => <Card key={label} padding="md"><p className="text-sm text-muted">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{formatCatalogBRL(value)}</p></Card>)}</div>
    <p className="mt-2 text-xs text-muted">Resumo realizado: considera somente lançamentos pagos no mês selecionado.</p>
    <div className="mt-6">{!data.entries.length ? <EmptyState>Nenhum lançamento neste período.</EmptyState> : <Card><ul className="divide-y">{data.entries.map(row => <li key={row.id} className="grid gap-2 p-4 lg:grid-cols-[6rem_minmax(0,1fr)_7rem_6rem_6rem_9rem] lg:items-center"><span className="text-sm">{formatNumericDate(row.entry_date)}</span><span className="break-words text-sm font-medium">{row.description || "Lançamento manual"}</span><span className="text-sm text-muted">{FINANCIAL_SOURCES[row.source_type]}</span><span className="text-sm">{row.payment_method ? FINANCIAL_METHODS[row.payment_method as keyof typeof FINANCIAL_METHODS] : "—"}</span><Badge variant={row.status === "paid" ? "success" : "neutral"}>{FINANCIAL_STATUS[row.status]}</Badge><span className={`font-semibold tabular-nums ${row.entry_type === "income" ? "text-success" : "text-danger"}`}>{row.entry_type === "income" ? "+" : "−"} {formatCatalogBRL(row.amount)}</span></li>)}</ul></Card>}</div>
    <nav aria-label="Páginas de lançamentos" className="mt-4 flex justify-between text-sm">{data.page > 1 ? <Link className="focus-ring rounded-xl p-3" href={`?month=${data.period.month}&page=${data.page - 1}`}>Anterior</Link> : <span />}{data.page * 50 < data.count && <Link className="focus-ring rounded-xl p-3" href={`?month=${data.period.month}&page=${data.page + 1}`}>Próxima</Link>}</nav>
  </>;
}
