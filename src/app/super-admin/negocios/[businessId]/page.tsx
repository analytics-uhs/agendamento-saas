import type { Metadata } from "next";
import { ArrowLeft, CalendarClock, ExternalLink, Mail, MapPin, Moon, Phone, Sun, UserRound } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/admin/status-badge";
import { BusinessStatusBadge } from "@/components/super-admin/business-status-badge";
import { BusinessStatusControl } from "@/components/super-admin/business-status-control";
import { FacebookIcon, InstagramIcon } from "@/components/ui/social-icons";
import { formatDuration, formatLongDate, formatShortDate } from "@/lib/date";
import { bookingGroupProductName } from "@/lib/booking-groups";
import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { getPalette } from "@/lib/palettes";
import { getPlatformBusinessDetail } from "@/lib/repositories/super-admin";

export const metadata: Metadata = { title: "Detalhe do negócio | Super Admin" };

const weekdays = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const durationLabels = { fixed: "Duração fixa", fixed_multiple: "Duração fixa + múltiplos blocos", group_2: "Duração pelo Grupo secundário" } as const;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function dateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value));
}

export default async function PlatformBusinessDetailPage({ params }: { params: Promise<{ businessId: string }> }) {
  await requirePlatformAdmin();
  const { businessId } = await params;
  if (!uuidPattern.test(businessId)) notFound();
  const detail = await getPlatformBusinessDetail(businessId);
  if (!detail) notFound();
  const { business, settings } = detail;
  const palette = settings?.palette.id ? getPalette(settings.palette.id) : getPalette("original");
  const summary = [
    ["Hoje", detail.appointmentSummary.today], ["Futuros", detail.appointmentSummary.future], ["Concluídos", detail.appointmentSummary.completed],
    ["Cancelados", detail.appointmentSummary.cancelled], ["Não compareceram", detail.appointmentSummary.noShow],
  ];
  const hourDays = weekdays.map((label, weekday) => ({
    label,
    windows: detail.hours.filter((hour) => hour.weekday === weekday && hour.active),
  }));

  return <><Link href="/super-admin/negocios" className="focus-ring inline-flex items-center gap-1 rounded-lg text-sm font-medium text-muted hover:text-foreground"><ArrowLeft className="h-4 w-4" />Negócios</Link>
    <header className="mt-4 flex flex-col justify-between gap-5 rounded-xl border bg-background p-5 sm:flex-row sm:items-start">
      <div className="flex min-w-0 items-start gap-4">{business.logoUrl ? <div role="img" aria-label={`Logo de ${business.name}`} className="h-14 w-14 shrink-0 rounded-xl border bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${business.logoUrl})` }} /> : <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xl font-semibold text-primary">{business.name.slice(0, 1).toUpperCase()}</div>}<div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="truncate text-2xl font-semibold tracking-tight">{business.name}</h1><BusinessStatusBadge active={business.active} /></div><p className="mt-1 text-sm text-muted">/{business.slug} · criado em {formatShortDate(business.createdAt.slice(0, 10))}</p>{business.active ? <Link href={`/agendar/${business.slug}`} target="_blank" rel="noopener noreferrer" className="focus-ring mt-2 inline-flex items-center gap-1 rounded text-sm font-medium text-primary">Abrir página pública<ExternalLink className="h-3.5 w-3.5" /></Link> : <p className="mt-2 text-sm font-medium text-danger">Página pública indisponível</p>}</div></div>
      <BusinessStatusControl businessId={business.id} active={business.active} businessName={business.name} />
    </header>

    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <section className="rounded-xl border bg-background p-5"><h2 className="font-semibold">Dados gerais</h2><dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-xs text-muted">WhatsApp</dt><dd className="mt-1 flex items-center gap-1.5 font-medium"><Phone className="h-3.5 w-3.5 text-muted" />{business.whatsapp || "Não informado"}</dd></div><div><dt className="text-xs text-muted">Endereço</dt><dd className="mt-1 flex items-start gap-1.5 font-medium"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />{business.address || "Não informado"}</dd></div><div><dt className="text-xs text-muted">Última atualização</dt><dd className="mt-1 font-medium">{dateTime(business.updatedAt)}</dd></div><div><dt className="text-xs text-muted">Tema</dt><dd className="mt-1 font-medium">{settings ? <span aria-label={settings.themePreference === "dark" ? "Tema escuro" : "Tema claro"} title={settings.themePreference === "dark" ? "Tema escuro" : "Tema claro"}>{settings.themePreference === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}</span> : "Não configurado"}</dd></div><div><dt className="text-xs text-muted">Paleta</dt><dd className="mt-1 flex items-center gap-2 font-medium"><span className="h-4 w-4 rounded-full border" style={{ background: settings?.palette.primary ?? palette.primary }} /><span className="h-4 w-4 rounded-full border" style={{ background: settings?.palette.accent ?? palette.accent }} />{palette.name}</dd></div>{business.googleMapsUrl || business.instagramUrl || business.facebookUrl ? <div className="sm:col-span-2"><dt className="text-xs text-muted">Links públicos</dt><dd className="mt-2 flex flex-wrap gap-2">{business.googleMapsUrl ? <a href={business.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="focus-ring inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-medium hover:text-primary"><MapPin className="h-3.5 w-3.5" />Google Maps</a> : null}{business.instagramUrl ? <a href={business.instagramUrl} target="_blank" rel="noopener noreferrer" className="focus-ring inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-medium hover:text-primary"><InstagramIcon className="h-3.5 w-3.5" />Instagram</a> : null}{business.facebookUrl ? <a href={business.facebookUrl} target="_blank" rel="noopener noreferrer" className="focus-ring inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-medium hover:text-primary"><FacebookIcon className="h-3.5 w-3.5" />Facebook</a> : null}</dd></div> : null}{business.activeUpdatedAt ? <div className="sm:col-span-2"><dt className="text-xs text-muted">Última alteração de status</dt><dd className="mt-1 font-medium">{dateTime(business.activeUpdatedAt)}</dd></div> : null}</dl></section>

      <section className="rounded-xl border bg-background p-5"><h2 className="font-semibold">Configuração da agenda</h2>{settings ? <dl className="mt-4 grid gap-4 text-sm"><div><dt className="text-xs text-muted">Modo de duração</dt><dd className="mt-1 font-medium">{durationLabels[settings.durationMode]}</dd></div>{settings.durationMode !== "group_2" ? <div><dt className="text-xs text-muted">Duração base</dt><dd className="mt-1 font-medium">{formatDuration(settings.fixedDurationMinutes)}</dd></div> : null}</dl> : <p className="mt-4 text-sm text-muted">Configuração ainda não concluída.</p>}</section>
    </div>

    <section className="mt-5 rounded-xl border bg-background p-5"><h2 className="font-semibold">Grupos e opções</h2><div className="mt-4 grid gap-4 md:grid-cols-2">{detail.groups.length ? detail.groups.map((group) => <article key={group.position} className="rounded-xl border bg-surface/50 p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-xs text-muted">{bookingGroupProductName(group.position)}</p><h3 className="font-semibold">{group.label}</h3></div><BusinessStatusBadge active={group.active} /></div>{group.options.length ? <ul className="mt-3 space-y-2">{group.options.map((option) => <li key={option.id} className="flex items-center justify-between gap-3 text-sm"><span className={option.active ? "font-medium" : "text-muted line-through"}>{option.name}</span>{option.durationMinutes ? <span className="text-xs text-muted">{formatDuration(option.durationMinutes)}</span> : null}</li>)}</ul> : <p className="mt-3 text-sm text-muted">Nenhuma opção.</p>}</article>) : <p className="text-sm text-muted">Grupos ainda não configurados.</p>}</div></section>

    <section className="mt-5 rounded-xl border bg-background p-5"><h2 className="font-semibold">Horários de funcionamento</h2><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{hourDays.map((day) => <div key={day.label} className="rounded-xl border px-3 py-2 text-sm"><span>{day.label}</span>{day.windows.length ? <div className="mt-1 space-y-0.5">{day.windows.map((window) => <p key={`${window.startTime}-${window.endTime}`} className="font-medium">{window.startTime}–{window.endTime}</p>)}</div> : <p className="mt-1 text-muted">Fechado</p>}</div>)}</div></section>

    <section className="mt-5 rounded-xl border bg-background p-5"><h2 className="font-semibold">Usuários</h2>{detail.members.length ? <ul className="mt-4 divide-y">{detail.members.map((member) => <li key={member.id} className="flex flex-col justify-between gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center"><div className="min-w-0"><p className="flex items-center gap-1.5 truncate text-sm font-medium"><UserRound className="h-4 w-4 text-muted" />{member.name}</p><p className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted"><Mail className="h-3.5 w-3.5" />{member.email ?? "E-mail indisponível"}</p></div><div className="text-left sm:text-right"><span className="inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold capitalize text-primary">{member.role}</span><p className="mt-1 text-xs text-muted">Desde {formatShortDate(member.createdAt.slice(0, 10))}</p></div></li>)}</ul> : <p className="mt-4 text-sm text-muted">Nenhum membro vinculado.</p>}</section>

    <section className="mt-5"><h2 className="font-semibold">Resumo de agendamentos</h2><div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">{summary.map(([label, value]) => <article key={label} className="rounded-xl border bg-background p-4"><p className="text-xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs text-muted">{label}</p></article>)}</div></section>

    <section className="mt-5 overflow-hidden rounded-xl border bg-background"><header className="border-b px-5 py-4"><h2 className="font-semibold">Agendamentos recentes</h2><p className="mt-1 text-xs text-muted">Até 20 registros mais recentes.</p></header>{detail.recentAppointments.length ? <ul className="divide-y">{detail.recentAppointments.map((appointment) => <li key={appointment.id} className="grid grid-cols-[auto_1fr_auto] items-start gap-3 p-4"><CalendarClock className="mt-0.5 h-4 w-4 text-primary" /><div className="min-w-0"><p className="truncate text-sm font-medium">{appointment.customerName}</p><p className="mt-0.5 truncate text-xs text-muted">{formatLongDate(appointment.appointmentDate)} · {appointment.startTime}–{appointment.endTime}{appointment.group1Name ? ` · ${appointment.group1Name}` : ""}{appointment.group2Name ? ` · ${appointment.group2Name}` : ""}</p></div><StatusBadge status={appointment.status} /></li>)}</ul> : <p className="p-8 text-center text-sm text-muted">Nenhum agendamento registrado.</p>}</section>
  </>;
}
