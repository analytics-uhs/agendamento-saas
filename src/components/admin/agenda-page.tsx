"use client";

import {
  Ban,
  LoaderCircle,
  Plus,
  X,
} from "lucide-react";
import { useRef, useState, useTransition } from "react";
import {
  cancelCompleteReservation,
  cancelComplementaryReservation,
  loadDailyAdminCalendar,
} from "@/app/admin/agenda/actions";
import { AppointmentWhatsappReminder } from "@/components/admin/appointment-whatsapp-reminder";
import { AppointmentDetails } from "@/components/admin/appointment-details";
import { AppointmentFormModal } from "@/components/admin/appointment-form-modal";
import { CalendarBlockModal } from "@/components/admin/calendar-block-modal";
import { CalendarBlockDetails } from "@/components/admin/calendar-block-details";
import { BlockKindModal } from "@/components/admin/block-kind-modal";
import { ComplementaryBlockModal } from "@/components/admin/complementary-block-modal";
import { useAppointmentManagement } from "@/components/admin/use-appointment-management";
import { PageHeader } from "@/components/ui/page-header";
import { RecurringBadge } from "@/components/admin/recurring-badge";
import { StatusBadge } from "@/components/admin/status-badge";
import { DateStrip } from "@/components/booking/date-strip";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { classes } from "@/lib/classes";
import {
  formatLongDate,
  todayISO,
} from "@/lib/date";
import type {
  AdminAppointment,
  AppointmentSchedulingConfig,
  CalendarBlock,
  ResourceBlock,
} from "@/types/appointments";

export function AgendaPageContent({
  initialDate,
  initialAppointments,
  initialBlocks,
  initialResourceBlocks,
  config,
  businessActive,
  embedded = false,
  initialCreating = false,
}: {
  initialDate: string;
  initialAppointments: AdminAppointment[];
  initialBlocks: CalendarBlock[];
  initialResourceBlocks: ResourceBlock[];
  config: AppointmentSchedulingConfig;
  businessActive: boolean;
  embedded?: boolean;
  initialCreating?: boolean;
}) {
  const [windowStart, setWindowStart] = useState(initialDate);
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [creating, setCreating] = useState(initialCreating);
  const [editingAppointment, setEditingAppointment] = useState<AdminAppointment | null>(null);
  const [blocks, setBlocks] = useState(initialBlocks);
  const [, setResourceBlocks] = useState(initialResourceBlocks);
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [blockKindOpen, setBlockKindOpen] = useState(false);
  const [resourceBlockModalOpen, setResourceBlockModalOpen] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<CalendarBlock | null>(null);
  const [editingBlock, setEditingBlock] = useState<CalendarBlock | null>(null);
  const [loadingAgenda, startAgendaTransition] = useTransition();
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
  const agendaRequest = useRef(0);
  const groupOne = config.groups.find((group) => group.position === 1);
  const groupTwo = config.groups.find((group) => group.position === 2);
  const configurationInvalid = Boolean(
    (groupOne && groupOne.options.length === 0) ||
    (groupTwo && groupTwo.options.length === 0) ||
    (config.durationMode === "group_2" && !groupTwo),
  );

  function selectDate(date: string) {
    const request = ++agendaRequest.current;
    setSelectedDate(date);
    setSelectedId(null);
    setFeedback(null);
    startAgendaTransition(async () => {
      const result = await loadDailyAdminCalendar(date);
      if (request !== agendaRequest.current) return;
      if (result.ok) { setAppointments(result.data.appointments); setBlocks(result.data.blocks); setResourceBlocks(result.data.resourceBlocks ?? []); }
      else setFeedback({ ok: false, message: result.message });
    });
  }

  function openCreation() {
    setCreating(true);
    setSelectedId(null);
    setFeedback(null);
  }

  function cancelComplementaryComponent(appointment: AdminAppointment) {
    const complementary = appointment.complementary;
    if (!complementary || !window.confirm(`Cancelar ${complementary.optionName}?\n\nA reserva principal permanecerá ativa.`)) return;
    startSavingTransition(async () => { const result = await cancelComplementaryReservation(complementary.id, selectedDate); if (!result.ok) setFeedback({ ok: false, message: result.message }); else { setAppointments(result.data.appointments); setBlocks(result.data.blocks); setResourceBlocks(result.data.resourceBlocks ?? []); setFeedback({ ok: true, message: result.message }); } });
  }

  function cancelCompleteAggregate(appointment: AdminAppointment) {
    const complementary = appointment.complementary;
    if (!complementary || !window.confirm(`Cancelar a reserva completa?\n\n${appointment.group1?.name ?? "Agenda principal"} e ${complementary.optionName} serão cancelados.`)) return;
    startSavingTransition(async () => { const result = await cancelCompleteReservation(complementary.reservationId, selectedDate); if (!result.ok) setFeedback({ ok: false, message: result.message }); else { setAppointments(result.data.appointments); setBlocks(result.data.blocks); setResourceBlocks(result.data.resourceBlocks ?? []); setFeedback({ ok: true, message: result.message }); } });
  }

  return (
    <>
      {embedded ? (
        <header id="agenda-operacional" className="scroll-mt-20">
          <h2 className="text-xl font-semibold tracking-tight">
            Agenda operacional
          </h2>
          <p className="mt-1 text-sm text-muted">
            Visualize e gerencie os agendamentos.
          </p>
        </header>
      ) : (
        <PageHeader
          title="Agenda"
          description="Visualize e gerencie os agendamentos."
        />
      )}
      <div className="mt-6">
        <DateStrip
          allowPast
          windowStart={windowStart}
          onWindowStartChange={(value) => {
            setWindowStart(value);
            selectDate(value);
          }}
          selected={selectedDate}
          onSelect={selectDate}
        />
      </div>
      <div className="mt-6 flex items-center justify-between gap-3">
        <p className="truncate text-sm font-medium capitalize">
          {formatLongDate(selectedDate)}
        </p>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="outline" disabled={!businessActive || selectedDate < todayISO()} onClick={() => config.complementaryGroup ? setBlockKindOpen(true) : setBlockModalOpen(true)}><Plus className="h-4 w-4" />Bloqueio</Button>
          <Button size="sm" disabled={!businessActive || selectedDate < todayISO() || configurationInvalid} onClick={creating ? () => setCreating(false) : openCreation}>
            {creating ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{creating ? "Fechar" : "Novo"}
          </Button>
        </div>
      </div>

      {configurationInvalid ? (
        <EmptyState className="mt-4">
          Configure opções ativas nos grupos antes de criar agendamentos
          manuais.
        </EmptyState>
      ) : null}
      {creating ? (
        <AppointmentFormModal
          config={config}
          prefill={{ date: selectedDate }}
          onClose={() => setCreating(false)}
          onSaved={(next, date, message) => {
            if (date === selectedDate) setAppointments(next);
            else selectDate(date);
            setFeedback({ ok: true, message });
            setCreating(false);
          }}
        />
      ) : null}

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
      <section className="mt-4 overflow-hidden rounded-xl border bg-background">
        {loadingAgenda ? (
          <p className="flex items-center justify-center gap-2 p-8 text-sm text-muted">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Carregando agenda...
          </p>
        ) : appointments.length || blocks.length ? (
          <ul className="divide-y">
            {blocks.map((block) => (
              <li key={block.id}>
                <button type="button" onClick={() => setSelectedBlock(block)} className="focus-ring grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-4 text-left">
                  <span className="text-sm font-semibold tabular-nums">{block.startTime}</span>
                  <div className="min-w-0"><p className="flex items-center gap-1.5 truncate text-sm font-medium"><Ban className="h-4 w-4 shrink-0 text-muted" />Período bloqueado</p><p className="truncate text-xs text-muted">{[block.group1?.name, block.reason || "Indisponível", `${block.startTime}–${block.endTime}`].filter(Boolean).join(" · ")}</p></div>
                  {block.series ? <RecurringBadge /> : <span className="rounded-full border border-dashed px-2 py-1 text-[11px] font-medium text-muted">Bloqueio</span>}
                </button>
              </li>
            ))}
            {appointments.map((appointment) => (
              <li key={appointment.id}>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 p-4">
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedId(
                        selectedId === appointment.id ? null : appointment.id,
                      )
                    }
                    className="focus-ring grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-lg text-left"
                  >
                    <span className="text-sm font-semibold tabular-nums">
                      {appointment.startTime}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {appointment.customerName}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {[
                          appointment.group1?.name,
                          appointment.group2?.name,
                          `${appointment.startTime}–${appointment.endTime}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  </button>
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <AppointmentWhatsappReminder
                      appointment={appointment}
                      onReminderSent={(sentAt) =>
                        updateReminder(appointment.id, sentAt)
                      }
                    />
                    {appointment.series ? <RecurringBadge /> : null}
                    <StatusBadge status={appointment.status} />
                  </div>
                </div>
                {selectedId === appointment.id ? (
                  <AppointmentDetails
                    appointment={appointment}
                    saving={saving}
                    cancelling={cancellingId === appointment.id}
                    onStatus={(status) => updateStatus(appointment, status)}
                    onCancelScope={(scope) =>
                      cancelSeriesOccurrence(appointment, scope)
                    }
                    onCancelClose={() => setCancellingId(null)}
                    onEdit={() => setEditingAppointment(appointment)}
                    onCancelComplementary={() => cancelComplementaryComponent(appointment)}
                    onCancelComplete={() => cancelCompleteAggregate(appointment)}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-8 text-center text-sm text-muted">
            Nenhum agendamento nesta data.
          </p>
        )}
      </section>
      {editingAppointment ? (
        <AppointmentFormModal
          config={config}
          prefill={{ date: editingAppointment.appointmentDate }}
          appointment={editingAppointment}
          onClose={() => setEditingAppointment(null)}
          onSaved={(next, date, message) => {
            if (date === selectedDate) setAppointments(next);
            else selectDate(date);
            setFeedback({ ok: true, message });
            setEditingAppointment(null);
          }}
        />
      ) : null}
      {blockModalOpen || editingBlock ? <CalendarBlockModal config={config} initialDate={selectedDate} block={editingBlock} onClose={() => { setBlockModalOpen(false); setEditingBlock(null); }} onSaved={(next, date, message) => { if (date === selectedDate) setBlocks(next); else selectDate(date); setFeedback({ ok: true, message }); setBlockModalOpen(false); setEditingBlock(null); }} /> : null}
      {blockKindOpen && config.complementaryGroup ? <BlockKindModal intentName={config.complementaryGroup.intentName} onClose={() => setBlockKindOpen(false)} onSelect={(kind) => { setBlockKindOpen(false); if (kind === "primary") setBlockModalOpen(true); else setResourceBlockModalOpen(true); }} /> : null}
      {resourceBlockModalOpen ? <ComplementaryBlockModal config={config} initialDate={selectedDate} onClose={() => setResourceBlockModalOpen(false)} onSaved={(next, date, message) => { if (date === selectedDate) setResourceBlocks(next); else selectDate(date); setFeedback({ ok: true, message }); setResourceBlockModalOpen(false); }} /> : null}
      {selectedBlock ? <CalendarBlockDetails block={selectedBlock} onClose={() => setSelectedBlock(null)} onEdit={() => { setEditingBlock(selectedBlock); setSelectedBlock(null); }} onDeleted={(next, message) => { setBlocks(next); setFeedback({ ok: true, message }); setSelectedBlock(null); }} /> : null}
    </>
  );
}
