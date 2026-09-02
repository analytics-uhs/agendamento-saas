"use client";

import { Ban, CalendarCheck2, Clock3, LoaderCircle, Plus } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { cancelCompleteReservation, cancelComplementaryReservation, loadAdminAvailability, loadDailyAdminCalendar } from "@/app/admin/agenda/actions";
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
import { BlockKindModal } from "@/components/admin/block-kind-modal";
import { ComplementaryBlockModal } from "@/components/admin/complementary-block-modal";
import { ResourceBlockDetails } from "@/components/admin/resource-block-details";
import { ComplementaryReservationDetails } from "@/components/admin/complementary-reservation-details";
import { classes } from "@/lib/classes";
import { appointmentStatusLabels } from "@/lib/appointments";
import { calendarResources, isPastCalendarSlot } from "@/lib/daily-calendar";
import { DailyTimeline } from "@/components/admin/daily-timeline";
import { nearestTimelineSlot } from "@/lib/daily-timeline";
import { bookingGroupPosition } from "@/lib/booking-groups";
import { formatDuration, formatLongDate, todayISO } from "@/lib/date";
import type {
  AdminAppointment,
  AdminComplementaryReservation,
  AppointmentSchedulingConfig,
  AppointmentOption,
  CalendarBlock,
  DailyCalendarWindow,
  ResourceBlock,
} from "@/types/appointments";

export function DailyAgendaPage({
  initialDate,
  initialAppointments,
  initialComplementaryReservations,
  initialBlocks,
  initialResourceBlocks,
  initialWindows,
  config,
  businessActive,
}: {
  initialDate: string;
  initialAppointments: AdminAppointment[];
  initialComplementaryReservations: AdminComplementaryReservation[];
  initialBlocks: CalendarBlock[];
  initialResourceBlocks: ResourceBlock[];
  initialWindows: DailyCalendarWindow[];
  config: AppointmentSchedulingConfig;
  businessActive: boolean;
}) {
  const [windowStart, setWindowStart] = useState(initialDate);
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [windows, setWindows] = useState(initialWindows);
  const [blocks, setBlocks] = useState(initialBlocks);
  const [resourceBlocks, setResourceBlocks] = useState(initialResourceBlocks);
  const [complementaryReservations, setComplementaryReservations] = useState(initialComplementaryReservations);
  const [selectedComplementary, setSelectedComplementary] = useState<AdminComplementaryReservation | null>(null);
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [blockKindOpen, setBlockKindOpen] = useState(false);
  const [resourceBlockModalOpen, setResourceBlockModalOpen] = useState(false);
  const [selectedResourceBlock, setSelectedResourceBlock] = useState<ResourceBlock | null>(null);
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
    startSavingTransition,
    cancellingId,
    setCancellingId,
    updateStatus,
    cancelSeriesOccurrence,
    updateReminder,
  } = useAppointmentManagement(initialAppointments, selectedDate);
  const [resolvingTime, startResolvingTime] = useTransition();
  const createRequest = useRef(0);
  function createAtMinute(minute: number, group1OptionId: string | null) {
    const requestedDate = selectedDate;
    const calendarRequest = requestId.current;
    const currentRequest = ++createRequest.current;
    startResolvingTime(async () => {
      try {
        const result = await loadAdminAvailability({
          date: requestedDate,
          group1OptionId,
          group2OptionId: config.groups.find((group) => group.position === bookingGroupPosition("secondary"))?.options[0]?.id ?? null,
        });
        if (currentRequest !== createRequest.current || calendarRequest !== requestId.current) return;
        if (!result.ok) { setFeedback({ ok: false, message: result.message }); return; }
        const startTime = nearestTimelineSlot(result.data.filter((slot) => !isPastCalendarSlot(requestedDate, slot.startTime)), minute);
        if (!startTime) { setFeedback({ ok: false, message: "Não há horários disponíveis para esta opção nesta data." }); return; }
        setFormPrefill({ date: requestedDate, startTime, group1OptionId });
      } catch {
        if (currentRequest === createRequest.current && calendarRequest === requestId.current) setFeedback({ ok: false, message: "Não foi possível carregar os horários. Tente novamente." });
      }
    });
  }
  const selectedAppointment = appointments.find(
    (appointment) => appointment.id === selectedId,
  );
  const canCreate = businessActive && selectedDate >= todayISO();

  function applyCalendar(data: { appointments: AdminAppointment[]; complementaryReservations?: AdminComplementaryReservation[]; blocks: CalendarBlock[]; resourceBlocks?: ResourceBlock[]; windows: DailyCalendarWindow[] }) {
    setAppointments(data.appointments); setComplementaryReservations(data.complementaryReservations ?? []); setBlocks(data.blocks); setResourceBlocks(data.resourceBlocks ?? []); setWindows(data.windows);
  }

  function cancelComplementary(resource: AdminComplementaryReservation) {
    if (!window.confirm(`Cancelar ${resource.optionName}?\n\nA reserva principal permanecerá ativa.`)) return;
    startSavingTransition(async () => { const result = await cancelComplementaryReservation(resource.id, selectedDate); if (!result.ok) setFeedback({ ok: false, message: result.message }); else { applyCalendar(result.data); setFeedback({ ok: true, message: result.message }); } });
  }

  function cancelComplete(appointment: AdminAppointment) {
    if (!appointment.complementary || !window.confirm(`Cancelar a reserva completa?\n\n${appointment.group1?.name ?? "Agenda principal"} e ${appointment.complementary.optionName} serão cancelados.`)) return;
    startSavingTransition(async () => { const result = await cancelCompleteReservation(appointment.complementary!.reservationId, selectedDate); if (!result.ok) setFeedback({ ok: false, message: result.message }); else { applyCalendar(result.data); setFeedback({ ok: true, message: result.message }); setSelectedId(null); } });
  }

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
      setResourceBlocks(result.data.resourceBlocks ?? []);
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
            <Button size="sm" variant="outline" onClick={() => config.complementaryGroup ? setBlockKindOpen(true) : setBlockModalOpen(true)}><Plus className="h-4 w-4" />Bloqueio</Button>
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

      {config.complementaryGroup?.occupancyMode === "day" ? <DayReservations reservations={complementaryReservations.filter((item)=>item.occupancyMode==="day")} blocks={resourceBlocks.filter((item)=>item.occupancyMode==="day")} options={config.complementaryGroup.options} onSelectBlock={setSelectedResourceBlock} onSelectReservation={setSelectedComplementary} /> : null}
      {config.complementaryGroup?.occupancyMode === "time_slot" && (complementaryReservations.some((item)=>item.occupancyMode==="time_slot" && !appointments.some((appointment)=>appointment.complementary?.id===item.id)) || resourceBlocks.some((item)=>item.occupancyMode==="time_slot")) ? <TimeSlotReservations reservations={complementaryReservations.filter((item)=>item.occupancyMode==="time_slot" && !appointments.some((appointment)=>appointment.complementary?.id===item.id))} blocks={resourceBlocks.filter((item)=>item.occupancyMode==="time_slot")} onSelectBlock={setSelectedResourceBlock} onSelectReservation={setSelectedComplementary} /> : null}

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
          {resolvingTime ? <p role="status" className="mt-3 text-sm text-muted">Buscando o horário disponível mais próximo...</p> : null}
          <DailyTimeline
            resources={resources}
            selectedResourceId={mobileResourceId}
            onResourceChange={setMobileResourceId}
            windows={windows}
            appointments={appointments}
            blocks={blocks}
            canCreate={canCreate && !resolvingTime}
            onCreate={createAtMinute}
            renderAppointment={(appointment, height) => <DailyAppointmentCard appointment={appointment} height={height} onSelect={setSelectedId} onReminderSent={updateReminder} />}
            renderBlock={(block, height) => <DailyBlockCard block={block} height={height} onSelect={setSelectedBlock} />}
          />
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
            onCancelComplementary={() => cancelComplementary(selectedAppointment.complementary!)}
            onCancelComplete={() => cancelComplete(selectedAppointment)}
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
      {blockKindOpen && config.complementaryGroup ? <BlockKindModal intentName={config.complementaryGroup.intentName} onClose={() => setBlockKindOpen(false)} onSelect={(kind) => { setBlockKindOpen(false); if (kind === "primary") setBlockModalOpen(true); else setResourceBlockModalOpen(true); }} /> : null}
      {resourceBlockModalOpen ? <ComplementaryBlockModal config={config} initialDate={selectedDate} onClose={() => setResourceBlockModalOpen(false)} onSaved={(next, date, message) => { if (date === selectedDate) setResourceBlocks(next); else selectDate(date); setFeedback({ ok: true, message }); setResourceBlockModalOpen(false); }} /> : null}
      {selectedBlock ? (
        <CalendarBlockDetails block={selectedBlock} onClose={() => setSelectedBlock(null)} onEdit={() => { setEditingBlock(selectedBlock); setSelectedBlock(null); }} onDeleted={(next, message) => { setBlocks(next); setFeedback({ ok: true, message }); setSelectedBlock(null); }} />
      ) : null}
      {selectedResourceBlock ? <ResourceBlockDetails block={selectedResourceBlock} onClose={() => setSelectedResourceBlock(null)} onDeleted={(next, message) => { setResourceBlocks(next); setFeedback({ ok: true, message }); setSelectedResourceBlock(null); }} /> : null}
      {selectedComplementary ? <ComplementaryReservationDetails reservation={selectedComplementary} onClose={() => setSelectedComplementary(null)} onCancelled={(data, message) => { applyCalendar(data); setFeedback({ ok: true, message }); setSelectedComplementary(null); }} /> : null}
    </>
  );
}

function DayReservations({ reservations, blocks, options, onSelectBlock, onSelectReservation }: { reservations: AdminComplementaryReservation[]; blocks: ResourceBlock[]; options: AppointmentOption[]; onSelectBlock: (block: ResourceBlock) => void; onSelectReservation: (reservation: AdminComplementaryReservation) => void }) {
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
          const block = blocks.find((item) => item.option.id === option.id);
          return (
            <button type="button" disabled={!block && !reservation} onClick={() => block ? onSelectBlock(block) : reservation && onSelectReservation(reservation)} key={option.id} className={classes("rounded-xl border bg-surface/40 p-3 text-left", (block || reservation) && "focus-ring hover:border-primary/50", block && "border-primary/25 bg-primary/5")}>
              <p className="text-sm font-semibold">{option.name}</p>
              {block ? <><p className="mt-1 text-xs font-semibold text-primary">Bloqueado</p><p className="mt-1 text-xs text-muted">{block.reason || "Sem motivo informado"}</p></> : reservation ? (
                <>
                  <p className="mt-1 text-sm">{reservation.customerName}</p>
                  <p className="mt-1 text-xs text-muted">{appointmentStatusLabels[reservation.status]}</p>
                </>
              ) : <p className="mt-1 text-xs text-success">Disponível</p>}
            </button>
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

function TimeSlotReservations({ reservations, blocks, onSelectBlock, onSelectReservation }: { reservations: AdminComplementaryReservation[]; blocks: ResourceBlock[]; onSelectBlock: (block: ResourceBlock) => void; onSelectReservation: (reservation: AdminComplementaryReservation) => void }) {
  return <section className="mt-4 rounded-xl border bg-background p-4" aria-labelledby="time-slot-reservations-title"><div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-primary"/><h2 id="time-slot-reservations-title" className="text-sm font-semibold">Complementos por horário</h2></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{reservations.map((reservation)=><button type="button" onClick={() => onSelectReservation(reservation)} key={reservation.id} className="focus-ring flex items-center justify-between gap-3 rounded-xl border bg-surface/40 p-3 text-left hover:border-primary/50"><div><p className="text-sm font-semibold">{reservation.optionName}</p><p className="mt-0.5 text-xs text-muted">{reservation.customerName}</p><p className="mt-1 text-xs text-muted">{appointmentStatusLabels[reservation.status]}</p></div><span className="text-sm font-semibold tabular-nums">{reservation.startTime}–{reservation.endTime}</span></button>)}{blocks.map((block)=><button type="button" key={block.id} onClick={() => onSelectBlock(block)} className="focus-ring flex items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/5 p-3 text-left hover:border-primary/50"><div><p className="text-sm font-semibold">{block.option.name}</p><p className="mt-0.5 text-xs text-primary">Bloqueado{block.reason ? ` · ${block.reason}` : ""}</p></div><span className="text-sm font-semibold tabular-nums">{block.startTime}–{block.endTime}</span></button>)}</div></section>;
}

function DailyAppointmentCard({
  appointment,
  height,
  onSelect,
  onReminderSent,
}: {
  appointment: AdminAppointment;
  height: number;
  onSelect: (id: string) => void;
  onReminderSent: (appointmentId: string, sentAt: string) => void;
}) {
  return (
    <article
      className={classes(
        "relative flex h-full flex-col overflow-hidden rounded-lg border border-primary/25 bg-card px-2 py-1 hover:border-primary",
        appointment.status === "cancelled" && "opacity-55",
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(appointment.id)}
        className="focus-ring absolute inset-0 h-full w-full rounded-lg"
        aria-label={`Abrir agendamento de ${appointment.customerName} às ${appointment.startTime}, ${formatDuration(appointment.durationMinutes)}, ${appointmentStatusLabels[appointment.status]}`}
      />
      <div className="pointer-events-none relative flex min-h-0 flex-1 flex-col items-start overflow-hidden text-left">
        <p className="truncate text-xs font-semibold">
          {appointment.startTime} · {appointment.customerName}
        </p>
        {height >= 80 && appointment.calendarStartTime ? <p className="mt-1 text-xs text-muted">Iniciado na véspera · até {appointment.endTime}</p> : null}
        <p className={classes("mt-0.5 truncate text-[11px] text-muted", height < 64 && "hidden")}>
          {[appointment.group2?.name, formatDuration(appointment.durationMinutes)]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {height >= 144 && appointment.complementary ? <p className="mt-1 truncate rounded-md bg-accent/15 px-1.5 py-1 text-xs font-medium">{appointment.complementary.optionName} · {appointment.complementary.occupancyMode === "day" ? "Reserva do dia" : `${appointment.complementary.startTime}–${appointment.complementary.endTime}`}</p> : null}
      </div>
      {height >= 80 ? <div className="pointer-events-none relative flex shrink-0 items-center gap-1 overflow-hidden">
        <div className="pointer-events-auto"><AppointmentWhatsappReminder
          appointment={appointment}
          onReminderSent={(sentAt) =>
            onReminderSent(appointment.id, sentAt)
          }
        /></div>
        {appointment.series ? <RecurringBadge /> : null}
        <StatusBadge status={appointment.status} />
      </div> : height >= 44 ? <div className="pointer-events-none relative self-start"><StatusBadge status={appointment.status} /></div> : null}
    </article>
  );
}

function DailyBlockCard({
  block,
  height,
  onSelect,
}: {
  block: CalendarBlock;
  height: number;
  onSelect: (block: CalendarBlock) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(block)}
      className="focus-ring flex h-full w-full flex-col items-start overflow-hidden rounded-lg border border-dashed border-muted/60 bg-surface px-2 py-1 text-left hover:border-primary"
      aria-label={`Abrir bloqueio das ${block.startTime} às ${block.endTime}`}
    >
      <p className="flex items-center gap-1.5 truncate text-xs font-semibold">
        <Ban className="h-3.5 w-3.5 shrink-0 text-muted" />
        Bloqueado · {block.startTime}–{block.endTime}
      </p>
      {height >= 80 && block.calendarStartTime ? <p className="mt-1 text-xs text-muted">Iniciado na véspera</p> : null}
      <p className="mt-0.5 truncate text-[11px] text-muted">
        {block.reason || "Indisponível"}{block.series ? " · Recorrente" : ""}
      </p>
    </button>
  );
}
