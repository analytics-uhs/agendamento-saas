import Link from "next/link";
import { CalendarCheck, CalendarDays, Clock3, UserX } from "lucide-react";
import { AppointmentWhatsappReminder } from "@/components/admin/appointment-whatsapp-reminder";
import { PageHeading } from "@/components/admin/page-heading";
import { RecurringBadge } from "@/components/admin/recurring-badge";
import { StatusBadge } from "@/components/admin/status-badge";
import { formatDuration, formatLongDate } from "@/lib/date";
import type { AdminAppointment } from "@/types/appointments";

export function Dashboard({ businessName, today, appointments }: { businessName: string; today: string; appointments: AdminAppointment[] }) {
  const todays = appointments.filter((item) => item.appointmentDate === today);
  const stats = [
    { label: "Agendamentos hoje", value: todays.filter((item) => item.status === "scheduled").length, Icon: CalendarDays },
    { label: "Concluídos hoje", value: todays.filter((item) => item.status === "completed").length, Icon: CalendarCheck },
    { label: "Não compareceram", value: todays.filter((item) => item.status === "no_show").length, Icon: UserX },
    { label: "Próximos 7 dias", value: appointments.filter((item) => item.appointmentDate > today && item.status === "scheduled").length, Icon: Clock3 },
  ];
  return <><PageHeading title={`Olá, ${businessName}`} description={formatLongDate(today)} /><div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">{stats.map(({ label, value, Icon }) => <article key={label} className="rounded-xl border bg-background p-4"><Icon className="h-5 w-5 text-primary" /><p className="mt-3 text-2xl font-semibold">{value}</p><p className="text-xs text-muted">{label}</p></article>)}</div>
    <section className="mt-6 overflow-hidden rounded-xl border bg-background"><header className="flex items-center justify-between border-b px-4 py-3"><h2 className="text-sm font-semibold">Agendamentos de hoje</h2><Link href="/admin/agenda" className="focus-ring rounded-lg border px-3 py-1.5 text-xs font-semibold">Ver agenda</Link></header>{todays.length ? <ul className="divide-y">{todays.map((item) => <li key={item.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3"><span className="text-sm font-semibold tabular-nums">{item.startTime}</span><div className="min-w-0"><p className="truncate text-sm font-medium">{item.customerName}</p><p className="truncate text-xs text-muted">{[item.group1?.name, item.group2?.name, formatDuration(item.durationMinutes)].filter(Boolean).join(" · ")}</p></div><div className="flex flex-wrap items-center justify-end gap-1.5">{item.series ? <RecurringBadge /> : null}<StatusBadge status={item.status} /><AppointmentWhatsappReminder appointment={item} /></div></li>)}</ul> : <p className="p-8 text-center text-sm text-muted">Nenhum agendamento para hoje.</p>}</section>
  </>;
}
