import type { Metadata } from "next";
import { CalendarClock, ChevronLeft, ChevronRight, Search, Users } from "lucide-react";
import Link from "next/link";
import { PageHeading } from "@/components/admin/page-heading";
import { BusinessStatusBadge } from "@/components/super-admin/business-status-badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { formatShortDate } from "@/lib/date";
import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { listPlatformBusinesses } from "@/lib/repositories/super-admin";
import { parsePlatformBusinessQuery } from "@/lib/super-admin";

export const metadata: Metadata = { title: "Negócios | Super Admin" };

function pageHref(input: { search: string; status: string; page: number }) {
  const params = new URLSearchParams();
  if (input.search) params.set("q", input.search);
  if (input.status !== "all") params.set("status", input.status);
  if (input.page > 1) params.set("page", String(input.page));
  const query = params.toString();
  return `/super-admin/negocios${query ? `?${query}` : ""}`;
}

function nextAppointmentLabel(value: string | null) {
  if (!value) return "Nenhum futuro";
  return `${formatShortDate(value.slice(0, 10))} às ${value.slice(11, 16)}`;
}

export default async function PlatformBusinessesPage({ searchParams }: { searchParams: Promise<{ q?: string | string[]; status?: string | string[]; page?: string | string[] }> }) {
  await requirePlatformAdmin();
  const query = parsePlatformBusinessQuery(await searchParams);
  const result = await listPlatformBusinesses({ ...query, pageSize: 20 });
  return <><PageHeading title="Negócios" description={`${result.total} estabelecimento${result.total === 1 ? "" : "s"} encontrado${result.total === 1 ? "" : "s"}.`} />
    <form className="mt-6 grid gap-3 rounded-xl border bg-background p-4 sm:grid-cols-[1fr_180px_auto]" action="/super-admin/negocios" method="get">
      <div className="relative"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted" /><Input className="pl-9" type="search" name="q" defaultValue={query.search} maxLength={80} placeholder="Buscar por nome ou slug" aria-label="Buscar negócios" /></div>
      <Select name="status" defaultValue={query.status} aria-label="Filtrar por status"><option value="all">Todos os status</option><option value="active">Ativos</option><option value="inactive">Inativos</option></Select>
      <Button type="submit">Filtrar</Button>
    </form>

    {result.items.length ? <section className="mt-5 overflow-hidden rounded-xl border bg-background">
      <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[840px] text-left text-sm"><thead className="border-b bg-surface text-xs text-muted"><tr><th className="px-4 py-3 font-medium">Negócio</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Criado em</th><th className="px-4 py-3 text-center font-medium">Membros</th><th className="px-4 py-3 text-center font-medium">Agendamentos</th><th className="px-4 py-3 font-medium">Próximo</th></tr></thead><tbody className="divide-y">{result.items.map((business) => <tr key={business.id} className="hover:bg-surface/60"><td className="px-4 py-3"><Link href={`/super-admin/negocios/${business.id}`} className="focus-ring rounded font-semibold hover:text-primary">{business.name}</Link><p className="text-xs text-muted">/{business.slug}</p></td><td className="px-4 py-3"><BusinessStatusBadge active={business.active} /></td><td className="px-4 py-3 text-muted">{formatShortDate(business.createdAt.slice(0, 10))}</td><td className="px-4 py-3 text-center tabular-nums">{business.memberCount}</td><td className="px-4 py-3 text-center tabular-nums">{business.appointmentCount}</td><td className="px-4 py-3 text-muted">{nextAppointmentLabel(business.nextAppointment)}</td></tr>)}</tbody></table></div>
      <ul className="divide-y md:hidden">{result.items.map((business) => <li key={business.id}><Link href={`/super-admin/negocios/${business.id}`} className="focus-ring block p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold">{business.name}</p><p className="truncate text-xs text-muted">/{business.slug}</p></div><BusinessStatusBadge active={business.active} /></div><div className="mt-4 grid grid-cols-2 gap-3 text-xs text-muted"><span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{business.memberCount} membro{business.memberCount === 1 ? "" : "s"}</span><span className="flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5" />{business.appointmentCount} agendamento{business.appointmentCount === 1 ? "" : "s"}</span><span className="col-span-2">Próximo: {nextAppointmentLabel(business.nextAppointment)}</span></div></Link></li>)}</ul>
    </section> : <div className="mt-5 rounded-xl border border-dashed bg-background p-10 text-center"><h2 className="font-semibold">Nenhum negócio encontrado</h2><p className="mt-1 text-sm text-muted">Revise a busca ou o filtro selecionado.</p></div>}

    {result.totalPages > 1 ? <nav className="mt-5 flex items-center justify-between gap-3" aria-label="Paginação"><Link aria-disabled={result.page <= 1} tabIndex={result.page <= 1 ? -1 : undefined} href={pageHref({ ...query, page: Math.max(1, result.page - 1) })} className={`focus-ring inline-flex items-center gap-1 rounded-xl border bg-background px-3 py-2 text-sm font-semibold ${result.page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-surface"}`}><ChevronLeft className="h-4 w-4" />Anterior</Link><span className="text-sm text-muted">Página {result.page} de {result.totalPages}</span><Link aria-disabled={result.page >= result.totalPages} tabIndex={result.page >= result.totalPages ? -1 : undefined} href={pageHref({ ...query, page: Math.min(result.totalPages, result.page + 1) })} className={`focus-ring inline-flex items-center gap-1 rounded-xl border bg-background px-3 py-2 text-sm font-semibold ${result.page >= result.totalPages ? "pointer-events-none opacity-40" : "hover:bg-surface"}`}>Próxima<ChevronRight className="h-4 w-4" /></Link></nav> : null}
  </>;
}
