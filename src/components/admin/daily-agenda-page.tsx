"use client";

import { Clock3, LoaderCircle, Plus } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { loadDailyAdminCalendar } from "@/app/admin/agenda/actions";
import { AppointmentDetails } from "@/components/admin/appointment-details";
import { AppointmentFormModal, type AppointmentFormPrefill } from "@/components/admin/appointment-form-modal";
import { PageHeading } from "@/components/admin/page-heading";
import { RecurringBadge } from "@/components/admin/recurring-badge";
import { StatusBadge } from "@/components/admin/status-badge";
import { useAppointmentManagement } from "@/components/admin/use-appointment-management";
import { AppointmentWhatsappReminder } from "@/components/admin/appointment-whatsapp-reminder";
import { DateStrip } from "@/components/booking/date-strip";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { classes } from "@/lib/classes";
import {
  appointmentsForResource,
  buildDailyCalendarRows,
  calendarResources,
  calendarSlotMinutes,
  isPastCalendarSlot,
  isResourceOccupied,
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
  const [formPrefill, setFormPrefill] = useState<AppointmentFormPrefill | null>(null);
  const [editingAppointment, setEditingAppointment] = useState<AdminAppointment | null>(null);
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
  const rows = buildDailyCalendarRows(
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
          <Button size="sm" onClick={() => setFormPrefill({ date: selectedDate })}>
            <Plus className="h-4 w-4" />
            Novo
          </Button>
        ) : (
          <span className="inline-flex h-9 cursor-not-allowed items-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-white opacity-45">
            <Plus className="h-4 w-4" />
            Novo
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
            rows={rows}
            appointments={appointments}
            onSelect={setSelectedId}
            onReminderSent={updateReminder}
            onCreate={(time, group1OptionId) => setFormPrefill({ date: selectedDate, startTime: time, group1OptionId })}
            canCreate={canCreate}
            selectedDate={selectedDate}
          />
          <MobileDailyGrid
            resources={resources}
            resourceLabel={resourceLabel}
            selectedResourceId={mobileResourceId}
            onResourceChange={setMobileResourceId}
            rows={rows}
            appointments={appointments}
            onSelect={setSelectedId}
            onReminderSent={updateReminder}
            onCreate={(time, group1OptionId) => setFormPrefill({ date: selectedDate, startTime: time, group1OptionId })}
            canCreate={canCreate}
            selectedDate={selectedDate}
          />
          {!rows.length ? (
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
        <Modal title="Detalhes do agendamento" onClose={() => setSelectedId(null)}>
          <AppointmentDetails
            appointment={selectedAppointment}
            saving={saving}
            cancelling={cancellingId === selectedAppointment.id}
            onStatus={(status) => updateStatus(selectedAppointment, status)}
            onCancelScope={(scope) =>
              cancelSeriesOccurrence(selectedAppointment, scope)
            }
            onCancelClose={() => setCancellingId(null)}
            onEdit={() => { setEditingAppointment(selectedAppointment); setSelectedId(null); }}
          />
        </Modal>
      ) : null}
      {formPrefill || editingAppointment ? (
        <AppointmentFormModal
          config={config}
          prefill={formPrefill ?? { date: editingAppointment!.appointmentDate }}
          appointment={editingAppointment}
          onClose={() => { setFormPrefill(null); setEditingAppointment(null); }}
          onSaved={(next, date, message) => {
            if (date === selectedDate) setAppointments(next);
            else selectDate(date);
            setFeedback({ ok: true, message });
            setFormPrefill(null);
            setEditingAppointment(null);
          }}
        />
      ) : null}
    </>
  );
}

function DesktopDailyGrid({
  resources,
  rows,
  appointments,
  onSelect,
  onReminderSent,
  onCreate,
  canCreate,
  selectedDate,
}: {
  resources: DailyCalendarResource[];
  rows: ReturnType<typeof buildDailyCalendarRows>;
  appointments: AdminAppointment[];
  onSelect: (id: string) => void;
  onReminderSent: (appointmentId: string, sentAt: string) => void;
  onCreate: (time: string, resourceId: string | null) => void;
  canCreate: boolean;
  selectedDate: string;
}) {
  const gridStyle = {
    gridTemplateColumns: `${timeColumnWidth}px repeat(${resources.length}, minmax(${resourceColumnWidth}px, 1fr))`,
    minWidth: timeColumnWidth + resources.length * resourceColumnWidth,
  };
  if (!rows.length) return null;
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
        {rows.map((row) => (
          <DailyGridRow
            key={row.time}
            row={row}
            resources={resources}
            appointments={appointments}
            onSelect={onSelect}
            onReminderSent={onReminderSent}
            onCreate={onCreate}
            canCreate={canCreate && !isPastCalendarSlot(selectedDate, row.time)}
          />
        ))}
      </div>
    </div>
  );
}

function DailyGridRow({
  row,
  resources,
  appointments,
  onSelect,
  onReminderSent,
  onCreate,
  canCreate,
}: {
  row: ReturnType<typeof buildDailyCalendarRows>[number];
  resources: DailyCalendarResource[];
  appointments: AdminAppointment[];
  onSelect: (id: string) => void;
  onReminderSent: (appointmentId: string, sentAt: string) => void;
  onCreate: (time: string, resourceId: string | null) => void;
  canCreate: boolean;
}) {
  return (
    <>
      <div className="sticky left-0 z-10 min-h-20 border-b border-r bg-background px-2 py-3 text-center text-xs font-semibold tabular-nums text-muted">
        {row.time}
      </div>
      {resources.map((resource) => (
        <div
          key={`${row.time}-${resource.id ?? "business"}`}
          className={classes("relative min-h-20 border-b border-r p-1.5 last:border-r-0", !row.open && "bg-muted/10")}
        >
          <div className="space-y-1.5">
            {appointmentsForResource(appointments, resource.id, row.time).map(
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
          {row.open && canCreate && !isResourceOccupied(appointments, resource.id, row.time) ? <button type="button" aria-label={`Novo agendamento às ${row.time} para ${resource.name}`} onClick={() => onCreate(row.time, resource.id)} className="focus-ring absolute inset-1.5 rounded-lg opacity-0 transition-opacity hover:bg-primary/5 hover:opacity-100 focus:opacity-100"><Plus className="mx-auto h-4 w-4 text-primary" /></button> : null}
          {!row.open ? <span className="pointer-events-none absolute inset-0 grid place-items-center text-[10px] font-medium text-muted/70">Fechado</span> : null}
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
  rows,
  appointments,
  onSelect,
  onReminderSent,
  onCreate,
  canCreate,
  selectedDate,
}: {
  resources: DailyCalendarResource[];
  resourceLabel: string | null;
  selectedResourceId: string | null;
  onResourceChange: (id: string | null) => void;
  rows: ReturnType<typeof buildDailyCalendarRows>;
  appointments: AdminAppointment[];
  onSelect: (id: string) => void;
  onReminderSent: (appointmentId: string, sentAt: string) => void;
  onCreate: (time: string, resourceId: string | null) => void;
  canCreate: boolean;
  selectedDate: string;
}) {
  if (!rows.length) return null;
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
        {rows.map((row) => {
          const slotAppointments = appointmentsForResource(appointments, selectedResourceId, row.time);
          const slotCanCreate = row.open && canCreate && !isPastCalendarSlot(selectedDate, row.time) && !isResourceOccupied(appointments, selectedResourceId, row.time);
          return (
              <div
                key={row.time}
                className={classes("grid min-h-16 grid-cols-[58px_minmax(0,1fr)] border-b last:border-b-0", !row.open && "bg-muted/10")}
              >
                <div className="border-r px-2 py-3 text-center text-xs font-semibold tabular-nums text-muted">
                  {row.time}
                </div>
                <div className="relative space-y-2 p-2">
                  {slotAppointments.map((appointment) => (
                    <DailyAppointmentCard
                      key={appointment.id}
                      appointment={appointment}
                      onSelect={onSelect}
                      onReminderSent={onReminderSent}
                    />
                  ))}
                  {!row.open ? <span className="block py-2 text-center text-xs font-medium text-muted">Fechado</span> : null}
                  {slotCanCreate ? <button type="button" onClick={() => onCreate(row.time, selectedResourceId)} className="focus-ring flex min-h-10 w-full items-center justify-center gap-1 rounded-lg border border-dashed text-xs font-medium text-muted hover:border-primary hover:text-primary"><Plus className="h-3.5 w-3.5" />Novo</button> : null}
                </div>
              </div>
          );
        })}
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
