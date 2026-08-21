"use client";

import Link from "next/link";
import { Clock3, LoaderCircle, Plus } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { loadDailyAdminCalendar } from "@/app/admin/agenda/actions";
import { AppointmentDetails } from "@/components/admin/appointment-details";
import { PageHeading } from "@/components/admin/page-heading";
import { RecurringBadge } from "@/components/admin/recurring-badge";
import { StatusBadge } from "@/components/admin/status-badge";
import { useAppointmentManagement } from "@/components/admin/use-appointment-management";
import { AppointmentWhatsappReminder } from "@/components/admin/appointment-whatsapp-reminder";
import { DateStrip } from "@/components/booking/date-strip";
import { classes } from "@/lib/classes";
import {
  appointmentsForResource,
  buildDailyCalendarSections,
  calendarResources,
  calendarSlotMinutes,
  type DailyCalendarResource,
} from "@/lib/daily-calendar";
import { formatDuration, formatLongDate, todayISO } from "@/lib/date";
import type {
  AdminAppointment,
  AppointmentSchedulingConfig,
  DailyCalendarWindow,
} from "@/types/appointments";

const resourceColumnWidth = 176;
const timeColumnWidth = 72;

export function DailyAgendaPage({
  initialDate,
  initialAppointments,
  initialWindows,
  config,
  businessActive,
}: {
  initialDate: string;
  initialAppointments: AdminAppointment[];
  initialWindows: DailyCalendarWindow[];
  config: AppointmentSchedulingConfig;
  businessActive: boolean;
}) {
  const [windowStart, setWindowStart] = useState(initialDate);
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [windows, setWindows] = useState(initialWindows);
  const { label: resourceLabel, resources } = calendarResources(config);
  const [mobileResourceId, setMobileResourceId] = useState<string | null>(
    resources[0]?.id ?? null,
  );
  const [loading, startLoadingTransition] = useTransition();
  const requestId = useRef(0);
  const {
    appointments,
    setAppointments,
    selectedId,
    setSelectedId,
    feedback,
    setFeedback,
    saving,
    cancellingId,
    setCancellingId,
    updateStatus,
    cancelSeriesOccurrence,
    updateReminder,
  } = useAppointmentManagement(initialAppointments, selectedDate);
  const sections = buildDailyCalendarSections(
    windows,
    calendarSlotMinutes(config),
    appointments,
  );
  const selectedAppointment = appointments.find(
    (appointment) => appointment.id === selectedId,
  );
  const appointmentsOutsideWindows = appointments.filter(
    (appointment) =>
      !windows.some(
        (window) =>
          appointment.startTime >= window.startTime &&
          appointment.startTime < window.endTime,
      ),
  );
  const canCreate = businessActive && selectedDate >= todayISO();

  function selectDate(date: string) {
    const request = ++requestId.current;
    setSelectedDate(date);
    setSelectedId(null);
    setFeedback(null);
    startLoadingTransition(async () => {
      const result = await loadDailyAdminCalendar(date);
      if (request !== requestId.current) return;
      if (!result.ok) {
        setFeedback({ ok: false, message: result.message });
        return;
      }
      setAppointments(result.data.appointments);
      setWindows(result.data.windows);
    });
  }

  return (
    <>
      <PageHeading
        title="Agenda diária"
        description="Acompanhe o dia por recurso e horário."
      />
      <div className="mt-6">
        <DateStrip
          allowPast
          windowStart={windowStart}
          onWindowStartChange={(date) => {
            setWindowStart(date);
            selectDate(date);
          }}
          selected={selectedDate}
          onSelect={selectDate}
        />
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium capitalize">
            {formatLongDate(selectedDate)}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {resourceLabel
              ? `${resourceLabel} · ${resources.length} ${resources.length === 1 ? "opção" : "opções"}`
              : "Agenda única do estabelecimento"}
          </p>
        </div>
        {canCreate ? (
          <Link
            href={`/admin?date=${selectedDate}&new=1#agenda-operacional`}
            className="focus-ring inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Novo agendamento
          </Link>
        ) : (
          <span className="inline-flex h-9 cursor-not-allowed items-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-white opacity-45">
            <Plus className="h-4 w-4" />
            Novo agendamento
          </span>
        )}
      </div>

      {feedback ? (
        <p
          role="status"
          className={classes(
            "mt-4 whitespace-pre-line rounded-xl border p-3 text-sm",
            feedback.ok
              ? "border-success/25 bg-success/10 text-success"
              : "border-danger/25 bg-danger/10 text-danger",
          )}
        >
          {feedback.message}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-4 flex items-center justify-center gap-2 rounded-xl border bg-background p-10 text-sm text-muted">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Carregando agenda diária...
        </p>
      ) : resources.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed p-8 text-center text-sm text-muted">
          O {resourceLabel ?? "Grupo 1"} está ativo, mas não possui opções
          ativas.
        </p>
      ) : (
        <>
          <DesktopDailyGrid
            resources={resources}
            sections={sections}
            appointments={appointments}
            onSelect={setSelectedId}
            onReminderSent={updateReminder}
          />
          <MobileDailyGrid
            resources={resources}
            resourceLabel={resourceLabel}
            selectedResourceId={mobileResourceId}
            onResourceChange={setMobileResourceId}
            sections={sections}
            appointments={appointments}
            onSelect={setSelectedId}
            onReminderSent={updateReminder}
          />
          {!sections.length ? (
            <p className="mt-4 rounded-xl border border-dashed p-8 text-center text-sm text-muted">
              O estabelecimento não possui horário de funcionamento ativo
              nesta data.
            </p>
          ) : null}
          {appointmentsOutsideWindows.length ? (
            <OutsideHoursAppointments
              appointments={appointmentsOutsideWindows}
              onSelect={setSelectedId}
            />
          ) : null}
        </>
      )}

      {selectedAppointment ? (
        <section className="mt-5 overflow-hidden rounded-xl border bg-background">
          <header className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-sm font-semibold">Detalhes do agendamento</h2>
            <button
              type="button"
              className="focus-ring rounded-lg px-2 py-1 text-xs text-muted hover:text-foreground"
              onClick={() => setSelectedId(null)}
            >
              Fechar
            </button>
          </header>
          <AppointmentDetails
            appointment={selectedAppointment}
            saving={saving}
            cancelling={cancellingId === selectedAppointment.id}
            onStatus={(status) => updateStatus(selectedAppointment, status)}
            onCancelScope={(scope) =>
              cancelSeriesOccurrence(selectedAppointment, scope)
            }
            onCancelClose={() => setCancellingId(null)}
            onReminderSent={(sentAt) =>
              updateReminder(selectedAppointment.id, sentAt)
            }
          />
        </section>
      ) : null}
    </>
  );
}

function DesktopDailyGrid({
  resources,
  sections,
  appointments,
  onSelect,
  onReminderSent,
}: {
  resources: DailyCalendarResource[];
  sections: ReturnType<typeof buildDailyCalendarSections>;
  appointments: AdminAppointment[];
  onSelect: (id: string) => void;
  onReminderSent: (appointmentId: string, sentAt: string) => void;
}) {
  const gridStyle = {
    gridTemplateColumns: `${timeColumnWidth}px repeat(${resources.length}, minmax(${resourceColumnWidth}px, 1fr))`,
    minWidth: timeColumnWidth + resources.length * resourceColumnWidth,
  };
  if (!sections.length) return null;
  return (
    <div className="mt-4 hidden overflow-x-auto rounded-xl border bg-background md:block">
      <div className="grid" style={gridStyle}>
        <div className="sticky left-0 z-10 border-b border-r bg-background px-2 py-3 text-center text-xs font-semibold text-muted">
          Horário
        </div>
        {resources.map((resource) => (
          <div
            key={resource.id ?? "business"}
            className="border-b border-r bg-background px-3 py-3 text-center text-sm font-semibold last:border-r-0"
          >
            {resource.name}
          </div>
        ))}
        {sections.map((section, sectionIndex) => (
          <DailyGridSection
            key={`${section.startTime}-${section.endTime}`}
            section={section}
            sectionIndex={sectionIndex}
            previousEndTime={sections[sectionIndex - 1]?.endTime}
            resources={resources}
            appointments={appointments}
            onSelect={onSelect}
            onReminderSent={onReminderSent}
          />
        ))}
      </div>
    </div>
  );
}

function DailyGridSection({
  section,
  sectionIndex,
  previousEndTime,
  resources,
  appointments,
  onSelect,
  onReminderSent,
}: {
  section: ReturnType<typeof buildDailyCalendarSections>[number];
  sectionIndex: number;
  previousEndTime?: string;
  resources: DailyCalendarResource[];
  appointments: AdminAppointment[];
  onSelect: (id: string) => void;
  onReminderSent: (appointmentId: string, sentAt: string) => void;
}) {
  return (
    <>
      {sectionIndex > 0 ? (
        <div
          className="border-b bg-surface px-3 py-2 text-center text-xs font-medium text-muted"
          style={{ gridColumn: "1 / -1" }}
        >
          Intervalo fechado · {previousEndTime}–{section.startTime}
        </div>
      ) : null}
      <div
        className="border-b bg-primary/5 px-3 py-2 text-xs font-semibold text-primary"
        style={{ gridColumn: "1 / -1" }}
      >
        Funcionamento · {section.startTime}–{section.endTime}
      </div>
      {section.slots.map((slot) => (
        <DailyGridRow
          key={slot}
          slot={slot}
          resources={resources}
          appointments={appointments}
          onSelect={onSelect}
          onReminderSent={onReminderSent}
        />
      ))}
    </>
  );
}

function DailyGridRow({
  slot,
  resources,
  appointments,
  onSelect,
  onReminderSent,
}: {
  slot: string;
  resources: DailyCalendarResource[];
  appointments: AdminAppointment[];
  onSelect: (id: string) => void;
  onReminderSent: (appointmentId: string, sentAt: string) => void;
}) {
  return (
    <>
      <div className="sticky left-0 z-10 min-h-20 border-b border-r bg-background px-2 py-3 text-center text-xs font-semibold tabular-nums text-muted">
        {slot}
      </div>
      {resources.map((resource) => (
        <div
          key={`${slot}-${resource.id ?? "business"}`}
          className="min-h-20 border-b border-r p-1.5 last:border-r-0"
        >
          <div className="space-y-1.5">
            {appointmentsForResource(appointments, resource.id, slot).map(
              (appointment) => (
                <DailyAppointmentCard
                  key={appointment.id}
                  appointment={appointment}
                  onSelect={onSelect}
                  onReminderSent={onReminderSent}
                />
              ),
            )}
          </div>
        </div>
      ))}
    </>
  );
}

function MobileDailyGrid({
  resources,
  resourceLabel,
  selectedResourceId,
  onResourceChange,
  sections,
  appointments,
  onSelect,
  onReminderSent,
}: {
  resources: DailyCalendarResource[];
  resourceLabel: string | null;
  selectedResourceId: string | null;
  onResourceChange: (id: string | null) => void;
  sections: ReturnType<typeof buildDailyCalendarSections>;
  appointments: AdminAppointment[];
  onSelect: (id: string) => void;
  onReminderSent: (appointmentId: string, sentAt: string) => void;
}) {
  if (!sections.length) return null;
  return (
    <div className="mt-4 md:hidden">
      {resources.length > 1 ? (
        <div>
          <p className="mb-2 text-xs font-medium text-muted">
            {resourceLabel ?? "Agenda"}
          </p>
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
            {resources.map((resource) => (
              <button
                key={resource.id ?? "business"}
                type="button"
                onClick={() => onResourceChange(resource.id)}
                className={classes(
                  "focus-ring shrink-0 rounded-full border bg-card px-4 py-2 text-sm font-semibold",
                  selectedResourceId === resource.id &&
                    "border-primary bg-primary text-white",
                )}
              >
                {resource.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="mt-2 overflow-hidden rounded-xl border bg-background">
        <div className="border-b px-4 py-3 text-sm font-semibold">
          {resources.find((resource) => resource.id === selectedResourceId)
            ?.name ?? resources[0]?.name}
        </div>
        {sections.map((section, sectionIndex) => (
          <div key={`${section.startTime}-${section.endTime}`}>
            {sectionIndex > 0 ? (
              <div className="border-b bg-surface px-3 py-2 text-center text-xs font-medium text-muted">
                Intervalo fechado · {sections[sectionIndex - 1]?.endTime}–
                {section.startTime}
              </div>
            ) : null}
            <div className="border-b bg-primary/5 px-3 py-2 text-xs font-semibold text-primary">
              Funcionamento · {section.startTime}–{section.endTime}
            </div>
            {section.slots.map((slot) => (
              <div
                key={slot}
                className="grid min-h-16 grid-cols-[58px_minmax(0,1fr)] border-b last:border-b-0"
              >
                <div className="border-r px-2 py-3 text-center text-xs font-semibold tabular-nums text-muted">
                  {slot}
                </div>
                <div className="space-y-2 p-2">
                  {appointmentsForResource(
                    appointments,
                    selectedResourceId,
                    slot,
                  ).map((appointment) => (
                    <DailyAppointmentCard
                      key={appointment.id}
                      appointment={appointment}
                      onSelect={onSelect}
                      onReminderSent={onReminderSent}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function DailyAppointmentCard({
  appointment,
  onSelect,
  onReminderSent,
}: {
  appointment: AdminAppointment;
  onSelect: (id: string) => void;
  onReminderSent: (appointmentId: string, sentAt: string) => void;
}) {
  return (
    <article
      className={classes(
        "rounded-lg border border-primary/25 bg-primary/5 p-2",
        appointment.status === "cancelled" && "opacity-55",
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(appointment.id)}
        className="focus-ring block w-full rounded text-left"
        aria-label={`Abrir agendamento de ${appointment.customerName} às ${appointment.startTime}`}
      >
        <p className="truncate text-xs font-semibold">
          {appointment.startTime} · {appointment.customerName}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-muted">
          {[appointment.group2?.name, formatDuration(appointment.durationMinutes)]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </button>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <AppointmentWhatsappReminder
          appointment={appointment}
          onReminderSent={(sentAt) =>
            onReminderSent(appointment.id, sentAt)
          }
        />
        {appointment.series ? <RecurringBadge /> : null}
        <StatusBadge status={appointment.status} />
      </div>
    </article>
  );
}

function OutsideHoursAppointments({
  appointments,
  onSelect,
}: {
  appointments: AdminAppointment[];
  onSelect: (id: string) => void;
}) {
  return (
    <section className="mt-4 rounded-xl border border-accent/30 bg-accent/5 p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Clock3 className="h-4 w-4 text-accent" />
        Fora do horário configurado
      </h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {appointments.map((appointment) => (
          <button
            key={appointment.id}
            type="button"
            onClick={() => onSelect(appointment.id)}
            className="focus-ring rounded-lg border bg-background px-3 py-2 text-left text-xs"
          >
            <span className="font-semibold">{appointment.startTime}</span> ·{" "}
            {appointment.customerName}
          </button>
        ))}
      </div>
    </section>
  );
}
