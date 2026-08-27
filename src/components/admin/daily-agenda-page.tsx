"use client";

import { Ban, CalendarCheck2, Clock3, LoaderCircle, Plus } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { loadDailyAdminCalendar } from "@/app/admin/agenda/actions";
import { AppointmentDetails } from "@/components/admin/appointment-details";
import { AppointmentFormModal, type AppointmentFormPrefill } from "@/components/admin/appointment-form-modal";
import { PageHeader } from "@/components/ui/page-header";
import { RecurringBadge } from "@/components/admin/recurring-badge";
import { StatusBadge } from "@/components/admin/status-badge";
import { useAppointmentManagement } from "@/components/admin/use-appointment-management";
import { AppointmentWhatsappReminder } from "@/components/admin/appointment-whatsapp-reminder";
import { DateStrip } from "@/components/booking/date-strip";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { CalendarBlockModal } from "@/components/admin/calendar-block-modal";
import { CalendarBlockDetails } from "@/components/admin/calendar-block-details";
import { classes } from "@/lib/classes";
import { appointmentStatusLabels } from "@/lib/appointments";
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
import { endTimeToMinutes, timeToMinutes } from "@/lib/time-of-day";
import type {
  AdminAppointment,
  AdminComplementaryReservation,
  AppointmentSchedulingConfig,
  AppointmentOption,
  CalendarBlock,
  DailyCalendarWindow,
} from "@/types/appointments";

const resourceColumnWidth = 176;
const timeColumnWidth = 72;

export function DailyAgendaPage({
  initialDate,
  initialAppointments,
  initialComplementaryReservations,
  initialBlocks,
  initialWindows,
  config,
  businessActive,
}: {
  initialDate: string;
  initialAppointments: AdminAppointment[];
  initialComplementaryReservations: AdminComplementaryReservation[];
  initialBlocks: CalendarBlock[];
  initialWindows: DailyCalendarWindow[];
  config: AppointmentSchedulingConfig;
  businessActive: boolean;
}) {
  const [windowStart, setWindowStart] = useState(initialDate);
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [windows, setWindows] = useState(initialWindows);
  const [blocks, setBlocks] = useState(initialBlocks);
  const [complementaryReservations, setComplementaryReservations] = useState(initialComplementaryReservations);
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<CalendarBlock | null>(null);
  const [editingBlock, setEditingBlock] = useState<CalendarBlock | null>(null);
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
    blocks,
  );
  const selectedAppointment = appointments.find(
    (appointment) => appointment.id === selectedId,
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
      setComplementaryReservations(result.data.complementaryReservations ?? []);
      setBlocks(result.data.blocks);
      setWindows(result.data.windows);
    });
  }

  return (
    <>
      <PageHeader
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
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setBlockModalOpen(true)}><Plus className="h-4 w-4" />Bloqueio</Button>
            <Button size="sm" onClick={() => setFormPrefill({ date: selectedDate })}><Plus className="h-4 w-4" />Novo</Button>
          </div>
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

      {config.complementaryGroup?.occupancyMode === "day" ? <DayReservations reservations={complementaryReservations.filter((item)=>item.occupancyMode==="day")} options={config.complementaryGroup.options} /> : null}
      {config.complementaryGroup && complementaryReservations.some((item)=>item.occupancyMode==="time_slot" && !appointments.some((appointment)=>appointment.complementary?.id===item.id)) ? <TimeSlotReservations reservations={complementaryReservations.filter((item)=>item.occupancyMode==="time_slot" && !appointments.some((appointment)=>appointment.complementary?.id===item.id))} /> : null}

      {loading ? (
        <p className="mt-4 flex items-center justify-center gap-2 rounded-xl border bg-background p-10 text-sm text-muted">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Carregando agenda diária...
        </p>
      ) : resources.length === 0 ? (
        <EmptyState size="lg" className="mt-4">
          O {resourceLabel ?? "Grupo principal"} está ativo, mas não possui opções
          ativas.
        </EmptyState>
      ) : (
        <>
          <DesktopDailyGrid
            resources={resources}
            rows={rows}
            appointments={appointments}
            blocks={blocks}
            onSelect={setSelectedId}
            onReminderSent={updateReminder}
            onCreate={(time, group1OptionId) => setFormPrefill({ date: selectedDate, startTime: time, group1OptionId })}
            onSelectBlock={(block) => setSelectedBlock(block)}
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
            blocks={blocks}
            onSelect={setSelectedId}
            onReminderSent={updateReminder}
            onCreate={(time, group1OptionId) => setFormPrefill({ date: selectedDate, startTime: time, group1OptionId })}
            onSelectBlock={(block) => setSelectedBlock(block)}
            canCreate={canCreate}
            selectedDate={selectedDate}
          />
          {!rows.length ? (
            <EmptyState size="lg" className="mt-4">
              O estabelecimento não possui horário de funcionamento ativo
              nesta data.
            </EmptyState>
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
          onSaved={(next, date, message, nextComplementary) => {
            if (date === selectedDate) setAppointments(next);
            else selectDate(date);
            if (date === selectedDate && nextComplementary) setComplementaryReservations(nextComplementary);
            setFeedback({ ok: true, message });
            setFormPrefill(null);
            setEditingAppointment(null);
          }}
        />
      ) : null}
      {blockModalOpen || editingBlock ? (
        <CalendarBlockModal config={config} initialDate={selectedDate} block={editingBlock} onClose={() => { setBlockModalOpen(false); setEditingBlock(null); }} onSaved={(next, date, message) => { if (date === selectedDate) setBlocks(next); else selectDate(date); setFeedback({ ok: true, message }); setBlockModalOpen(false); setEditingBlock(null); }} />
      ) : null}
      {selectedBlock ? (
        <CalendarBlockDetails block={selectedBlock} onClose={() => setSelectedBlock(null)} onEdit={() => { setEditingBlock(selectedBlock); setSelectedBlock(null); }} onDeleted={(next, message) => { setBlocks(next); setFeedback({ ok: true, message }); setSelectedBlock(null); }} />
      ) : null}
    </>
  );
}

function DayReservations({ reservations, options }: { reservations: AdminComplementaryReservation[]; options: AppointmentOption[] }) {
  const catalog = [
    ...options.map((option) => ({ id: option.id, name: option.name })),
    ...reservations
      .filter((reservation) => !options.some((option) => option.id === reservation.optionId))
      .map((reservation) => ({ id: reservation.optionId, name: reservation.optionName })),
  ];
  return (
    <section className="mt-4 rounded-xl border bg-background p-4" aria-labelledby="day-reservations-title">
      <div className="flex items-center gap-2">
        <CalendarCheck2 className="h-4 w-4 text-primary" />
        <h2 id="day-reservations-title" className="text-sm font-semibold">Reservas do dia</h2>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {catalog.map((option) => {
          const reservation = reservations.find((item) => item.optionId === option.id && item.status !== "cancelled");
          return (
            <div key={option.id} className="rounded-xl border bg-surface/40 p-3">
              <p className="text-sm font-semibold">{option.name}</p>
              {reservation ? (
                <>
                  <p className="mt-1 text-sm">{reservation.customerName}</p>
                  <p className="mt-1 text-xs text-muted">{appointmentStatusLabels[reservation.status]}</p>
                </>
              ) : <p className="mt-1 text-xs text-success">Disponível</p>}
            </div>
          );
        })}
      </div>
      {reservations.some((item) => item.status === "cancelled") ? (
        <div className="mt-3 border-t pt-3">
          <p className="text-xs font-semibold text-muted">Histórico cancelado</p>
          {reservations.filter((item) => item.status === "cancelled").map((item) => (
            <p key={item.id} className="mt-1 text-xs text-muted">{item.optionName} · {item.customerName}</p>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function TimeSlotReservations({ reservations }: { reservations: AdminComplementaryReservation[] }) {
  return <section className="mt-4 rounded-xl border bg-background p-4" aria-labelledby="time-slot-reservations-title"><div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-primary"/><h2 id="time-slot-reservations-title" className="text-sm font-semibold">Complementos por horário</h2></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{reservations.map((reservation)=><div key={reservation.id} className="flex items-center justify-between gap-3 rounded-xl border bg-surface/40 p-3"><div><p className="text-sm font-semibold">{reservation.optionName}</p><p className="mt-0.5 text-xs text-muted">{reservation.customerName}</p></div><span className="text-sm font-semibold tabular-nums">{reservation.startTime}–{reservation.endTime}</span></div>)}</div></section>;
}

function DesktopDailyGrid({
  resources,
  rows,
  appointments,
  blocks,
  onSelect,
  onReminderSent,
  onCreate,
  onSelectBlock,
  canCreate,
  selectedDate,
}: {
  resources: DailyCalendarResource[];
  rows: ReturnType<typeof buildDailyCalendarRows>;
  appointments: AdminAppointment[];
  blocks: CalendarBlock[];
  onSelect: (id: string) => void;
  onReminderSent: (appointmentId: string, sentAt: string) => void;
  onCreate: (time: string, resourceId: string | null) => void;
  onSelectBlock: (block: CalendarBlock) => void;
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
            blocks={blocks}
            onSelect={onSelect}
            onReminderSent={onReminderSent}
            onCreate={onCreate}
            onSelectBlock={onSelectBlock}
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
  blocks,
  onSelect,
  onReminderSent,
  onCreate,
  onSelectBlock,
  canCreate,
}: {
  row: ReturnType<typeof buildDailyCalendarRows>[number];
  resources: DailyCalendarResource[];
  appointments: AdminAppointment[];
  blocks: CalendarBlock[];
  onSelect: (id: string) => void;
  onReminderSent: (appointmentId: string, sentAt: string) => void;
  onCreate: (time: string, resourceId: string | null) => void;
  onSelectBlock: (block: CalendarBlock) => void;
  canCreate: boolean;
}) {
  return (
    <>
      <div className="sticky left-0 z-10 min-h-20 border-b border-r bg-background px-2 py-3 text-center text-xs font-semibold tabular-nums text-muted">
        {row.time}
      </div>
      {resources.map((resource) => {
        const slotAppointments = appointmentsForResource(appointments, resource.id, row.time);
        const slotBlocks = blocksForResource(blocks, resource.id, row.time);
        return <div
          key={`${row.time}-${resource.id ?? "business"}`}
          className={classes("relative min-h-20 border-b border-r p-1.5 last:border-r-0", !row.open && "bg-muted/10")}
        >
          <div className="space-y-1.5">
            {slotBlocks.map((block) => <DailyBlockCard key={block.id} block={block} onSelect={onSelectBlock} />)}
            {slotAppointments.map(
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
          {row.open && canCreate && !isResourceOccupied(appointments, resource.id, row.time) && !isBlockOccupied(blocks, resource.id, row.time) ? <button type="button" aria-label={`Novo agendamento às ${row.time} para ${resource.name}`} onClick={() => onCreate(row.time, resource.id)} className="focus-ring absolute inset-1.5 rounded-lg opacity-0 transition-opacity hover:bg-primary/5 hover:opacity-100 focus:opacity-100"><Plus className="mx-auto h-4 w-4 text-primary" /></button> : null}
          {!row.open && !slotAppointments.length && !slotBlocks.length ? <span className="pointer-events-none absolute inset-0 grid place-items-center text-[10px] font-medium text-muted/70">Fora do funcionamento</span> : null}
        </div>
      })}
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
  blocks,
  onSelect,
  onReminderSent,
  onCreate,
  onSelectBlock,
  canCreate,
  selectedDate,
}: {
  resources: DailyCalendarResource[];
  resourceLabel: string | null;
  selectedResourceId: string | null;
  onResourceChange: (id: string | null) => void;
  rows: ReturnType<typeof buildDailyCalendarRows>;
  appointments: AdminAppointment[];
  blocks: CalendarBlock[];
  onSelect: (id: string) => void;
  onReminderSent: (appointmentId: string, sentAt: string) => void;
  onCreate: (time: string, resourceId: string | null) => void;
  onSelectBlock: (block: CalendarBlock) => void;
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
          const slotBlocks = blocksForResource(blocks, selectedResourceId, row.time);
          const slotCanCreate = row.open && canCreate && !isPastCalendarSlot(selectedDate, row.time) && !isResourceOccupied(appointments, selectedResourceId, row.time) && !isBlockOccupied(blocks, selectedResourceId, row.time);
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
                  {slotBlocks.map((block) => <DailyBlockCard key={block.id} block={block} onSelect={onSelectBlock} />)}
                  {!row.open && !slotAppointments.length && !slotBlocks.length ? <span className="block py-2 text-center text-xs font-medium text-muted">Fora do funcionamento</span> : null}
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
        {appointment.complementary ? <p className="mt-1 truncate rounded-md bg-accent/15 px-1.5 py-1 text-xs font-medium">{appointment.complementary.optionName} · {appointment.complementary.occupancyMode === "day" ? "Reserva do dia" : `${appointment.complementary.startTime}–${appointment.complementary.endTime}`}</p> : null}
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

function blocksForResource(
  blocks: CalendarBlock[],
  resourceId: string | null,
  time: string,
) {
  return blocks.filter(
    (block) =>
      (resourceId === null || block.group1?.id === resourceId) &&
      block.startTime === time,
  );
}

function isBlockOccupied(
  blocks: CalendarBlock[],
  resourceId: string | null,
  time: string,
) {
  return blocks.some(
    (block) =>
      (resourceId === null || block.group1?.id === resourceId) &&
      timeToMinutes(block.startTime) <= timeToMinutes(time) &&
      timeToMinutes(time) < endTimeToMinutes(block.endTime),
  );
}

function DailyBlockCard({
  block,
  onSelect,
}: {
  block: CalendarBlock;
  onSelect: (block: CalendarBlock) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(block)}
      className="focus-ring block w-full rounded-lg border border-dashed border-muted/60 bg-surface px-2 py-2 text-left"
      aria-label={`Abrir bloqueio das ${block.startTime} às ${block.endTime}`}
    >
      <p className="flex items-center gap-1.5 truncate text-xs font-semibold">
        <Ban className="h-3.5 w-3.5 shrink-0 text-muted" />
        Bloqueado · {block.startTime}–{block.endTime}
      </p>
      <p className="mt-0.5 truncate text-[11px] text-muted">
        {block.reason || "Indisponível"}{block.series ? " · Recorrente" : ""}
      </p>
    </button>
  );
}
