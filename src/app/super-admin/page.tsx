import type { Metadata } from "next";
import { Building2, CalendarClock, CalendarDays, CircleCheckBig, CircleOff, Sparkles } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { getPlatformMetrics } from "@/lib/repositories/super-admin";

export const metadata: Metadata = { title: "Super Admin" };

export default async function SuperAdminDashboardPage() {
  await requirePlatformAdmin();
  const metrics = await getPlatformMetrics();
  const cards = [
    { label: "Total de negócios", value: metrics.totalBusinesses, Icon: Building2 },
    { label: "Negócios ativos", value: metrics.activeBusinesses, Icon: CircleCheckBig },
    { label: "Negócios inativos", value: metrics.inactiveBusinesses, Icon: CircleOff },
    { label: "Agendamentos hoje", value: metrics.appointmentsToday, Icon: CalendarDays },
    { label: "Agendamentos futuros", value: metrics.futureAppointments, Icon: CalendarClock },
    { label: "Novos nos últimos 30 dias", value: metrics.newBusinesses30Days, Icon: Sparkles },
  ];
  return <><PageHeader title="Visão geral" description="Acompanhe os principais números da plataforma." action={<Link href="/super-admin/negocios" className="focus-ring hidden rounded-xl border bg-background px-4 py-2 text-sm font-semibold hover:bg-surface sm:block">Ver negócios</Link>} />
    <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-3">{cards.map(({ label, value, Icon }) => <Card as="article" padding="md" key={label}><Icon className="h-5 w-5 text-primary" /><p className="mt-4 text-2xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs text-muted sm:text-sm">{label}</p></Card>)}</div>
    <Card as="section" padding="lg" className="mt-6"><h2 className="font-semibold">Administração da plataforma</h2><p className="mt-1 text-sm text-muted">Consulte configurações e atividade dos estabelecimentos ou altere seu status operacional.</p><Link href="/super-admin/negocios" className="focus-ring mt-4 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white">Gerenciar negócios</Link></Card>
  </>;
}
