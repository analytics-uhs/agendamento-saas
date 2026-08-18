"use client";

import Link from "next/link";
import { CalendarCheck, CalendarDays, Clock3, Users } from "lucide-react";
import { useMockApp } from "@/components/mock-app-provider";
import { PageHeading } from "@/components/admin/page-heading";
import { StatusBadge } from "@/components/admin/status-badge";
import { formatDuration, formatLongDate, todayISO } from "@/lib/date";

export function Dashboard() {
  const { state } = useMockApp(), today = todayISO();
  const todays = state.appointments.filter((item) => item.date === today).sort((a, b) => a.time.localeCompare(b.time));
  const stats = [
    { label: "Agendamentos hoje", value: todays.filter((item) => item.status === "scheduled").length, Icon: CalendarDays },
    { label: "Concluídos hoje", value: todays.filter((item) => item.status === "done").length, Icon: CalendarCheck },
    { label: "Opções no Grupo 1", value: state.group1.enabled ? state.group1.options.length : 0, Icon: Users },
    { label: "Próximos 7 dias", value: state.appointments.filter((item) => item.date >= today && item.status === "scheduled").length, Icon: Clock3 },
  ];
  return <><PageHeading title={`Olá, ${state.business.name}`} description={formatLongDate(today)} /><div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">{stats.map(({ label, value, Icon }) => <article key={label} className="rounded-xl border bg-background p-4"><Icon className="h-5 w-5 text-primary" /><p className="mt-3 text-2xl font-semibold">{value}</p><p className="text-xs text-muted">{label}</p></article>)}</div>
    <section className="mt-6 overflow-hidden rounded-xl border bg-background"><header className="flex items-center justify-between border-b px-4 py-3"><h2 className="text-sm font-semibold">Agendamentos de hoje</h2><Link href="/admin/agenda" className="focus-ring rounded-lg border px-3 py-1.5 text-xs font-semibold">Ver agenda</Link></header><ul className="divide-y">{todays.map((item) => <li key={item.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3"><span className="text-sm font-semibold tabular-nums">{item.time}</span><div className="min-w-0"><p className="truncate text-sm font-medium">{item.customer}</p><p className="truncate text-xs text-muted">{item.group2 ? `${item.group2} · ` : ""}{item.group1} · {formatDuration(item.durationMinutes)}</p></div><StatusBadge status={item.status} /></li>)}</ul></section>
  </>;
}
