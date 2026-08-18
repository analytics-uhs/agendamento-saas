"use client";

import { Ban, CheckCircle2, Clock3, LoaderCircle, Plus, Repeat2, UserX, X } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { cancelRecurringAppointment, changeAppointmentStatus, createManualAppointment, createRecurringAppointment, loadAdminAppointments, loadAdminAvailability } from "@/app/admin/agenda/actions";
import { AppointmentWhatsappReminder } from "@/components/admin/appointment-whatsapp-reminder";
import { PageHeading } from "@/components/admin/page-heading";
import { RecurringBadge } from "@/components/admin/recurring-badge";
import { StatusBadge } from "@/components/admin/status-badge";
import { DateStrip } from "@/components/booking/date-strip";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/field";
import { appointmentSourceLabels, manualAppointmentDuration } from "@/lib/appointments";
import { classes } from "@/lib/classes";
import { formatDateTime, formatDuration, formatLongDate, formatNumericDate, todayISO } from "@/lib/date";
import { recurrenceSummary, recurrenceWeekday } from "@/lib/recurrence";
import type { AdminAppointment, AppointmentSchedulingConfig } from "@/types/appointments";
import type { AppointmentStatus } from "@/types/database";
import type { BookingSlot } from "@/types/public-booking";

type FormState = {
  customerName: string;
  customerWhatsapp: string;
  group1OptionId: string | null;
  group2OptionId: string | null;
  startTime: string | null;
  blocks: number;
  recurring: boolean;
  recurrenceType: "permanent" | "count";
  repeatCount: number;
};

function initialForm(config: AppointmentSchedulingConfig): FormState {
  return {
    customerName: "",
    customerWhatsapp: "",
    group1OptionId: config.groups.find((group) => group.position === 1)?.options[0]?.id ?? null,
    group2OptionId: config.groups.find((group) => group.position === 2)?.options[0]?.id ?? null,
    startTime: null,
    blocks: 1,
    recurring: false,
    recurrenceType: "permanent",
    repeatCount: 12,
  };
}

const statusActions: { status: "completed" | "no_show" | "cancelled"; label: string; Icon: typeof Ban; variant?: "danger" }[] = [
  { status: "completed", label: "Concluir", Icon: CheckCircle2 },
  { status: "no_show", label: "Não compareceu", Icon: UserX },
  { status: "cancelled", label: "Cancelar", Icon: Ban, variant: "danger" },
];

export function AgendaPageContent({ initialDate, initialAppointments, config, businessActive }: { initialDate: string; initialAppointments: AdminAppointment[]; config: AppointmentSchedulingConfig; businessActive: boolean }) {
  const [windowStart, setWindowStart] = useState(initialDate);
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [appointments, setAppointments] = useState(initialAppointments);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(() => initialForm(config));
  const [slots, setSlots] = useState<BookingSlot[]>([]);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [loadingAgenda, startAgendaTransition] = useTransition();
  const [loadingSlots, startSlotsTransition] = useTransition();
  const [saving, startSavingTransition] = useTransition();
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const agendaRequest = useRef(0);
  const slotRequest = useRef(0);
  const groupOne = config.groups.find((group) => group.position === 1);
  const groupTwo = config.groups.find((group) => group.position === 2);
  const selectedSlot = slots.find((slot) => slot.startTime === form.startTime);
  const selectedGroupTwo = groupTwo?.options.find((option) => option.id === form.group2OptionId);
  const selectedDuration = manualAppointmentDuration({ mode: config.durationMode, fixedDurationMinutes: config.fixedDurationMinutes, group2DurationMinutes: selectedGroupTwo?.durationMinutes ?? null, blocks: form.blocks });
  const configurationInvalid = Boolean((groupOne && groupOne.options.length === 0) || (groupTwo && groupTwo.options.length === 0) || (config.durationMode === "group_2" && !groupTwo));

  function fetchAvailability(date: string, group1OptionId = form.group1OptionId, group2OptionId = form.group2OptionId) {
    const request = ++slotRequest.current;
    setSlots([]);
    setForm((current) => ({ ...current, startTime: null, blocks: 1 }));
    startSlotsTransition(async () => {
      const result = await loadAdminAvailability({ date, group1OptionId, group2OptionId });
      if (request !== slotRequest.current) return;
      if (result.ok) setSlots(result.data);
      else setFeedback({ ok: false, message: result.message });
    });
  }

  function selectDate(date: string) {
    const request = ++agendaRequest.current;
    setSelectedDate(date);
    setSelectedId(null);
    setFeedback(null);
    if (creating) fetchAvailability(date);
    startAgendaTransition(async () => {
      const result = await loadAdminAppointments(date);
      if (request !== agendaRequest.current) return;
      if (result.ok) setAppointments(result.data);
      else setFeedback({ ok: false, message: result.message });
    });
  }

  function openCreation() {
    const next = initialForm(config);
    setForm(next);
    setCreating(true);
    setSelectedId(null);
    setFeedback(null);
    fetchAvailability(selectedDate, next.group1OptionId, next.group2OptionId);
  }

  function changeGroup(position: 1 | 2, optionId: string) {
    const nextGroup1 = position === 1 ? optionId : form.group1OptionId;
    const nextGroup2 = position === 2 ? optionId : form.group2OptionId;
    setForm((current) => ({ ...current, group1OptionId: nextGroup1, group2OptionId: nextGroup2, startTime: null, blocks: 1 }));
    setFeedback(null);
    fetchAvailability(selectedDate, nextGroup1, nextGroup2);
  }

  function submitManualAppointment() {
    if (!form.startTime) return;
    setFeedback(null);
    startSavingTransition(async () => {
      const input = {
        group1OptionId: form.group1OptionId,
        group2OptionId: form.group2OptionId,
        date: selectedDate,
        startTime: form.startTime!,
        blocks: form.blocks,
        customerName: form.customerName,
        customerWhatsapp: form.customerWhatsapp,
      };
      const result = form.recurring
        ? await createRecurringAppointment({ ...input, repeatCount: form.recurrenceType === "count" ? form.repeatCount : null })
        : await createManualAppointment(input);
      if (!result.ok) {
        setFeedback({ ok: false, message: result.message });
        if (result.conflict) fetchAvailability(selectedDate);
        if (result.staleSelection) setCreating(false);
        return;
      }
      setAppointments(result.data);
      setCreating(false);
      setFeedback({ ok: true, message: result.message });
    });
  }

  function updateStatus(appointment: AdminAppointment, status: AppointmentStatus) {
    if (status === "cancelled" && appointment.series) {
      setCancellingId(appointment.id);
      return;
    }
    if (status === "cancelled" && !window.confirm(`Cancelar o agendamento de ${appointment.customerName}?`)) return;
    setFeedback(null);
    startSavingTransition(async () => {
      const result = await changeAppointmentStatus(appointment.id, status, selectedDate);
      if (!result.ok) {
        setFeedback({ ok: false, message: result.message });
        return;
      }
      setAppointments(result.data);
      setFeedback({ ok: true, message: result.message });
    });
  }

  function cancelSeriesOccurrence(appointment: AdminAppointment, scope: "single" | "future") {
    setFeedback(null);
    startSavingTransition(async () => {
      const result = await cancelRecurringAppointment(appointment.id, scope, selectedDate);
      if (!result.ok) setFeedback({ ok: false, message: result.message });
      else {
        setAppointments(result.data);
        setFeedback({ ok: true, message: result.message });
        setCancellingId(null);
      }
    });
  }

  function updateReminder(appointmentId: string, reminderSentAt: string) {
    setAppointments((current) => current.map((appointment) => appointment.id === appointmentId ? { ...appointment, reminderSentAt } : appointment));
  }

  return <><PageHeading title="Agenda" description="Visualize e gerencie os agendamentos." />
    <div className="mt-6"><DateStrip allowPast windowStart={windowStart} onWindowStartChange={(value) => { setWindowStart(value); selectDate(value); }} selected={selectedDate} onSelect={selectDate} /></div>
    <div className="mt-6 flex items-center justify-between gap-3"><p className="truncate text-sm font-medium capitalize">{formatLongDate(selectedDate)}</p><Button size="sm" disabled={!businessActive || selectedDate < todayISO() || configurationInvalid} onClick={creating ? () => setCreating(false) : openCreation}>{creating ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{creating ? "Fechar" : "Novo"}</Button></div>

    {configurationInvalid ? <p className="mt-4 rounded-xl border border-dashed p-5 text-center text-sm text-muted">Configure opções ativas nos grupos antes de criar agendamentos manuais.</p> : null}
    {creating ? <section className="step-in mt-4 rounded-xl border bg-background p-4"><h2 className="font-semibold">Novo agendamento</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">
      {groupOne ? <div className="space-y-1"><Label htmlFor="new-g1">{groupOne.label}</Label><Select id="new-g1" value={form.group1OptionId ?? ""} onChange={(event) => changeGroup(1, event.target.value)}>{groupOne.options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</Select></div> : null}
      {groupTwo ? <div className="space-y-1"><Label htmlFor="new-g2">{groupTwo.label}</Label><Select id="new-g2" value={form.group2OptionId ?? ""} onChange={(event) => changeGroup(2, event.target.value)}>{groupTwo.options.map((option) => <option key={option.id} value={option.id}>{option.name}{config.durationMode === "group_2" ? ` · ${formatDuration(option.durationMinutes ?? 0)}` : ""}</option>)}</Select></div> : null}
      <div className="space-y-1"><Label htmlFor="new-customer">Cliente</Label><Input id="new-customer" value={form.customerName} maxLength={120} onChange={(event) => setForm({ ...form, customerName: event.target.value })} placeholder="Nome do cliente" /></div>
      <div className="space-y-1"><Label htmlFor="new-whatsapp">WhatsApp</Label><Input id="new-whatsapp" inputMode="tel" value={form.customerWhatsapp} onChange={(event) => setForm({ ...form, customerWhatsapp: event.target.value })} placeholder="(00) 00000-0000" /></div>
    </div>
      <div className="mt-4"><p className="mb-2 text-sm font-medium">Horário</p>{loadingSlots ? <p className="flex items-center justify-center gap-2 rounded-xl border border-dashed p-5 text-sm text-muted"><LoaderCircle className="h-4 w-4 animate-spin" />Consultando disponibilidade...</p> : slots.length ? <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">{slots.map((slot) => <button key={slot.startTime} type="button" onClick={() => setForm({ ...form, startTime: slot.startTime, blocks: 1 })} className={classes("focus-ring rounded-xl border bg-card py-2.5 text-sm font-semibold", form.startTime === slot.startTime && "border-primary bg-primary text-white")}>{slot.startTime}</button>)}</div> : <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted">Nenhum horário disponível nesta data.</p>}</div>
      {form.startTime && selectedSlot && config.durationMode === "fixed_multiple" ? <div className="mt-4"><p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted"><Clock3 className="h-3.5 w-3.5" />Duração a partir de {form.startTime}</p><div className="flex flex-wrap gap-2">{Array.from({ length: selectedSlot.maxBlocks }, (_, index) => index + 1).map((blocks) => <button key={blocks} type="button" onClick={() => setForm({ ...form, blocks })} className={classes("focus-ring rounded-xl border bg-card px-4 py-2 text-sm font-semibold", form.blocks === blocks && "border-primary bg-primary text-white")}>{formatDuration(selectedSlot.durationMinutes * blocks)}</button>)}</div></div> : null}
      <div className="mt-4 rounded-xl border bg-surface/50 p-4"><label className="flex cursor-pointer items-center gap-3 text-sm font-medium"><input type="checkbox" className="h-4 w-4 accent-primary" checked={form.recurring} onChange={(event) => setForm({ ...form, recurring: event.target.checked })} />Repetir semanalmente</label>
        {form.recurring ? <div className="step-in mt-4 space-y-3 border-t pt-4"><p className="text-sm font-medium">Repetição</p><div className="grid gap-2 sm:grid-cols-2"><label className="flex cursor-pointer items-center gap-2 rounded-xl border bg-background p-3 text-sm"><input type="radio" name="recurrence" className="accent-primary" checked={form.recurrenceType === "permanent"} onChange={() => setForm({ ...form, recurrenceType: "permanent" })} />Permanente</label><label className="flex cursor-pointer items-center gap-2 rounded-xl border bg-background p-3 text-sm"><input type="radio" name="recurrence" className="accent-primary" checked={form.recurrenceType === "count"} onChange={() => setForm({ ...form, recurrenceType: "count" })} />Quantidade de repetições</label></div>{form.recurrenceType === "count" ? <div className="max-w-xs space-y-1"><Label htmlFor="repeat-count">Número de repetições</Label><div className="flex items-center gap-2"><Input id="repeat-count" type="number" min={2} max={260} value={form.repeatCount} onChange={(event) => setForm({ ...form, repeatCount: Number(event.target.value) })} /><span className="text-sm text-muted">repetições</span></div></div> : null}{form.startTime ? <p className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm font-medium text-primary"><Repeat2 className="h-4 w-4" />{recurrenceSummary(selectedDate, form.startTime, form.recurrenceType === "count" ? form.repeatCount : null)}</p> : null}</div> : null}
      </div>
      {form.startTime ? <p className="mt-4 text-sm text-muted">{formatLongDate(selectedDate)} · {form.startTime} · {selectedDuration ? formatDuration(selectedDuration) : "duração inválida"}</p> : null}
      <div className="mt-4 flex justify-end gap-2"><Button variant="ghost" onClick={() => setCreating(false)}>Cancelar</Button><Button disabled={saving || !form.startTime || !form.customerName.trim() || !form.customerWhatsapp.trim() || !selectedDuration || (form.recurring && form.recurrenceType === "count" && (!Number.isInteger(form.repeatCount) || form.repeatCount < 2))} onClick={submitManualAppointment}>{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}{saving ? "Adicionando..." : form.recurring ? "Criar recorrência" : "Adicionar"}</Button></div>
    </section> : null}

    {feedback ? <p role="status" className={classes("mt-4 whitespace-pre-line rounded-xl border p-3 text-sm", feedback.ok ? "border-success/25 bg-success/10 text-success" : "border-danger/25 bg-danger/10 text-danger")}>{feedback.message}</p> : null}
    <section className="mt-4 overflow-hidden rounded-xl border bg-background">{loadingAgenda ? <p className="flex items-center justify-center gap-2 p-8 text-sm text-muted"><LoaderCircle className="h-4 w-4 animate-spin" />Carregando agenda...</p> : appointments.length ? <ul className="divide-y">{appointments.map((appointment) => <li key={appointment.id}><div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 p-4"><button type="button" onClick={() => setSelectedId(selectedId === appointment.id ? null : appointment.id)} className="focus-ring grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-lg text-left"><span className="text-sm font-semibold tabular-nums">{appointment.startTime}</span><div className="min-w-0"><p className="truncate text-sm font-medium">{appointment.customerName}</p><p className="truncate text-xs text-muted">{[appointment.group1?.name, appointment.group2?.name, `${appointment.startTime}–${appointment.endTime}`].filter(Boolean).join(" · ")}</p></div></button><div className="flex flex-wrap items-center justify-end gap-1.5">{appointment.series ? <RecurringBadge /> : null}<StatusBadge status={appointment.status} /><AppointmentWhatsappReminder appointment={appointment} onReminderSent={(sentAt) => updateReminder(appointment.id, sentAt)} /></div></div>
          {selectedId === appointment.id ? <AppointmentDetails appointment={appointment} saving={saving} cancelling={cancellingId === appointment.id} onStatus={(status) => updateStatus(appointment, status)} onCancelScope={(scope) => cancelSeriesOccurrence(appointment, scope)} onCancelClose={() => setCancellingId(null)} onReminderSent={(sentAt) => updateReminder(appointment.id, sentAt)} /> : null}</li>)}</ul> : <p className="p-8 text-center text-sm text-muted">Nenhum agendamento nesta data.</p>}</section>
  </>;
}

function AppointmentDetails({ appointment, saving, cancelling, onStatus, onCancelScope, onCancelClose, onReminderSent }: { appointment: AdminAppointment; saving: boolean; cancelling: boolean; onStatus: (status: AppointmentStatus) => void; onCancelScope: (scope: "single" | "future") => void; onCancelClose: () => void; onReminderSent: (reminderSentAt: string) => void }) {
  return <div className="step-in border-t bg-surface/50 p-4"><dl className="grid gap-3 text-sm sm:grid-cols-2">
    <div><dt className="text-xs text-muted">Cliente</dt><dd className="font-medium">{appointment.customerName}</dd></div>
    <div><dt className="text-xs text-muted">WhatsApp</dt><dd className="font-medium">{appointment.customerWhatsapp}</dd></div>
    <div><dt className="text-xs text-muted">Data e horário</dt><dd className="font-medium capitalize">{formatLongDate(appointment.appointmentDate)} · {appointment.startTime}–{appointment.endTime}</dd></div>
    <div><dt className="text-xs text-muted">Duração</dt><dd className="font-medium">{formatDuration(appointment.durationMinutes)}</dd></div>
    {appointment.group1 ? <div><dt className="text-xs text-muted">{appointment.group1.label}</dt><dd className="font-medium">{appointment.group1.name}</dd></div> : null}
    {appointment.group2 ? <div><dt className="text-xs text-muted">{appointment.group2.label}</dt><dd className="font-medium">{appointment.group2.name}</dd></div> : null}
    <div><dt className="text-xs text-muted">Origem</dt><dd className="font-medium">{appointmentSourceLabels[appointment.source]}</dd></div>
    {appointment.series ? <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 sm:col-span-2"><dt className="flex items-center gap-2 text-xs font-semibold text-primary"><Repeat2 className="h-3.5 w-3.5" />Recorrente</dt><dd className="mt-1 text-sm">Toda {recurrenceWeekday(appointment.series.startsOn)} às {appointment.series.startTime} · primeira data {formatNumericDate(appointment.series.startsOn)} · {appointment.series.repeatCount === null ? "Permanente" : `${appointment.series.repeatCount} repetições · ocorrência ${appointment.series.occurrenceNumber} de ${appointment.series.repeatCount}`}</dd></div> : null}
    {appointment.reminderSentAt ? <div><dt className="text-xs text-muted">Último lembrete</dt><dd className="font-medium">Lembrete enviado em {formatDateTime(appointment.reminderSentAt)}</dd></div> : null}
  </dl>
    {cancelling ? <div className="mt-4 rounded-xl border border-danger/25 bg-danger/5 p-3"><p className="text-sm font-semibold">Como deseja cancelar?</p><p className="mt-1 text-xs text-muted">O histórico anterior não será alterado.</p><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="danger" disabled={saving} onClick={() => onCancelScope("single")}>Cancelar somente este</Button><Button size="sm" variant="danger" disabled={saving} onClick={() => onCancelScope("future")}>Cancelar este e os próximos</Button><Button size="sm" variant="ghost" disabled={saving} onClick={onCancelClose}>Voltar</Button></div></div> : null}
    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <AppointmentWhatsappReminder appointment={appointment} variant="full" onReminderSent={onReminderSent} />
      <div className="flex flex-wrap items-center justify-end gap-2 sm:ml-auto">{appointment.status === "scheduled" ? statusActions.map(({ status, label, Icon, variant }) => <Button key={status} disabled={saving} variant={variant ?? "ghost"} size="sm" onClick={() => onStatus(status)}><Icon className="h-3.5 w-3.5" />{label}</Button>) : null}</div>
    </div>
  </div>;
}
