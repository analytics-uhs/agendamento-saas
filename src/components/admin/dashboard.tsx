import { CalendarCheck, CalendarDays, Clock3, UserX } from "lucide-react";
import { AgendaPageContent } from "@/components/admin/agenda-page";
import { PageHeading } from "@/components/admin/page-heading";
import { formatLongDate } from "@/lib/date";
import type {
  AdminAppointment,
  AppointmentSchedulingConfig,
} from "@/types/appointments";

export function Dashboard({
  businessName,
  today,
  summaryAppointments,
  operationalDate,
  operationalAppointments,
  config,
  businessActive,
  initialCreating,
}: {
  businessName: string;
  today: string;
  summaryAppointments: AdminAppointment[];
  operationalDate: string;
  operationalAppointments: AdminAppointment[];
  config: AppointmentSchedulingConfig;
  businessActive: boolean;
  initialCreating: boolean;
}) {
  const todays = summaryAppointments.filter(
    (item) => item.appointmentDate === today,
  );
  const stats = [
    {
      label: "Agendamentos hoje",
      value: todays.filter((item) => item.status === "scheduled").length,
      Icon: CalendarDays,
    },
    {
      label: "Concluídos hoje",
      value: todays.filter((item) => item.status === "completed").length,
      Icon: CalendarCheck,
    },
    {
      label: "Não compareceram",
      value: todays.filter((item) => item.status === "no_show").length,
      Icon: UserX,
    },
    {
      label: "Próximos 7 dias",
      value: summaryAppointments.filter(
        (item) => item.appointmentDate > today && item.status === "scheduled",
      ).length,
      Icon: Clock3,
    },
  ];
  return (
    <>
      <PageHeading
        title={`Olá, ${businessName}`}
        description={formatLongDate(today)}
      />
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(({ label, value, Icon }) => (
          <article key={label} className="rounded-xl border bg-background p-4">
            <Icon className="h-5 w-5 text-primary" />
            <p className="mt-3 text-2xl font-semibold">{value}</p>
            <p className="text-xs text-muted">{label}</p>
          </article>
        ))}
      </div>
      <section className="mt-8 border-t pt-8">
        <AgendaPageContent
          embedded
          initialDate={operationalDate}
          initialAppointments={operationalAppointments}
          config={config}
          businessActive={businessActive}
          initialCreating={initialCreating}
        />
      </section>
    </>
  );
}
