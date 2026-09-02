"use client";

import { Check, Info, LoaderCircle, Repeat2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import {
  createManualAppointment,
  createManualReservation,
  createRecurringAppointment,
  editAppointmentOccurrence,
  loadAdminEditAvailability,
  loadAdminAvailability,
  loadAdminComplementaryAvailability,
} from "@/app/admin/agenda/actions";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { buildManualAppointmentInput, initialAppointmentBlocks, isWithinBusinessHours, manualAppointmentDuration } from "@/lib/appointments";
import { classes } from "@/lib/classes";
import { formatDuration, formatLongDate, todayISO } from "@/lib/date";
import { recurrenceSummary } from "@/lib/recurrence";
import { formatWhatsappInput } from "@/lib/availability";
import { revalidateAdminTimeSelection } from "@/lib/admin-time-selection";
import { consecutiveSelectionTimes, fixedMultipleEndTime, selectFixedMultipleSlot } from "@/lib/fixed-multiple-selection";
import type { AdminAppointment, AdminComplementaryReservation, AdminReservationIntent, AppointmentSchedulingConfig } from "@/types/appointments";
import type { BookingSlot } from "@/types/public-booking";

export type AppointmentFormPrefill = {
  date: string;
  startTime?: string;
  group1OptionId?: string | null;
};

export function AppointmentFormModal({
  config,
  prefill,
  appointment,
  onClose,
  onSaved,
}: {
  config: AppointmentSchedulingConfig;
  prefill: AppointmentFormPrefill;
  appointment?: AdminAppointment | null;
  onClose: () => void;
  onSaved: (appointments: AdminAppointment[], date: string, message: string, complementaryReservations?: AdminComplementaryReservation[]) => void;
}) {
  const groupOne = config.groups.find((group) => group.position === 1);
  const groupTwo = config.groups.find((group) => group.position === 2);
  const editing = Boolean(appointment);
  const complementaryGroup = config.complementaryGroup;
  const [intent, setIntent] = useState<AdminReservationIntent>("primary");
  const [complementaryOptionId, setComplementaryOptionId] = useState<string | null>(complementaryGroup?.options[0]?.id ?? null);
  const [complementaryStartTime, setComplementaryStartTime] = useState(prefill.startTime ?? "09:00");
  const [complementaryEndTime, setComplementaryEndTime] = useState("10:00");
  const [availableComplementaryIds, setAvailableComplementaryIds] = useState<string[]>([]);
  const [date, setDate] = useState(appointment?.appointmentDate ?? prefill.date);
  const [group1OptionId, setGroup1OptionId] = useState<string | null>(appointment?.group1?.id ?? prefill.group1OptionId ?? groupOne?.options[0]?.id ?? null);
  const [group2OptionId, setGroup2OptionId] = useState<string | null>(appointment?.group2?.id ?? groupTwo?.options[0]?.id ?? null);
  const [customerName, setCustomerName] = useState(appointment?.customerName ?? "");
  const [customerWhatsapp, setCustomerWhatsapp] = useState(formatWhatsappInput(appointment?.customerWhatsapp ?? ""));
  const [startTime, setStartTime] = useState<string | null>(appointment?.startTime ?? prefill.startTime ?? null);
  const [blocks, setBlocks] = useState(() => appointment ? initialAppointmentBlocks({ durationMinutes: appointment.durationMinutes, mode: config.durationMode, fixedDurationMinutes: config.fixedDurationMinutes }) : 1);
  const [recurring, setRecurring] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState<"permanent" | "count">("permanent");
  const [repeatCount, setRepeatCount] = useState(12);
  const [slots, setSlots] = useState<BookingSlot[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [sequenceMessage, setSequenceMessage] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [saving, startSaving] = useTransition();

  useEffect(() => {
    if (intent === "complementary") return;
    let cancelled = false;
    startLoading(async () => {
      try {
        const result = appointment
          ? await loadAdminEditAvailability(appointment.id, { date, group1OptionId, group2OptionId })
          : await loadAdminAvailability({ date, group1OptionId, group2OptionId });
        if (cancelled) return;
        if (!result.ok) { setSlots([]); setStartTime(null); setBlocks(1); setMessage(result.message); return; }
        const next = result.data;
        const selection = revalidateAdminTimeSelection(next, startTime, blocks, config.durationMode === "fixed_multiple");
        setSlots(next);
        setMessage(null);
        setSequenceMessage(null);
        setStartTime(selection.startTime);
        setBlocks(selection.blocks);
      } catch {
        if (!cancelled) { setSlots([]); setStartTime(null); setBlocks(1); setMessage("Não foi possível consultar os horários. Selecione a data novamente para tentar."); }
      }
    });
    return () => { cancelled = true; };
    // Selection changes use already-loaded slots; only context changes reload availability.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointment, date, group1OptionId, group2OptionId, intent, config.durationMode]);

  const selectedSlot = slots.find((slot) => slot.startTime === startTime);
  const selectedTimes = config.durationMode === "fixed_multiple"
    ? consecutiveSelectionTimes(slots, startTime, blocks).filter((time) => !startTime || time >= startTime)
    : startTime ? [startTime] : [];
  const group2Duration = groupTwo?.options.find((option) => option.id === group2OptionId)?.durationMinutes ?? null;
  const duration = manualAppointmentDuration({ mode: config.durationMode, fixedDurationMinutes: config.fixedDurationMinutes, group2DurationMinutes: group2Duration, blocks });
  const outsideBusinessHours = Boolean(startTime && duration && !isWithinBusinessHours({
    date,
    startTime,
    durationMinutes: duration,
    businessHours: config.businessHours,
  }));
  const includesPrimary = intent !== "complementary";
  const includesComplementary = intent !== "primary";
  const primaryEndTime = startTime && duration ? fixedMultipleEndTime(startTime, duration, 1) : null;

  useEffect(() => {
    if (!complementaryGroup || !includesComplementary) return;
    const start = complementaryGroup.occupancyMode === "time_slot" ? (intent === "combined" ? startTime : complementaryStartTime) : null;
    const end = complementaryGroup.occupancyMode === "time_slot" ? (intent === "combined" ? primaryEndTime : complementaryEndTime) : null;
    if (complementaryGroup.occupancyMode === "time_slot" && (!start || !end)) return;
    startLoading(async () => { const result = await loadAdminComplementaryAvailability({ date, startTime: start, endTime: end }); if (!result.ok) { setAvailableComplementaryIds([]); setMessage(result.message); return; } const available=result.data.options.filter((option)=>option.available).map((option)=>option.id); setAvailableComplementaryIds(available); setComplementaryOptionId((current)=>current && available.includes(current) ? current : available[0] ?? null); });
  }, [complementaryGroup, includesComplementary, intent, date, startTime, primaryEndTime, complementaryStartTime, complementaryEndTime]);

  function submit() {
    if (loading || saving || (includesPrimary && (!startTime || !selectedSlot))) return;
    const selectedStartTime = startTime;
    startSaving(async () => {
      const input = selectedStartTime ? buildManualAppointmentInput({ group1OptionId, group2OptionId, date, startTime: selectedStartTime, blocks, customerName, customerWhatsapp }) : null;
      const result = !editing && complementaryGroup && !recurring
        ? await createManualReservation({ intent, primary: includesPrimary ? input : null, complementary: includesComplementary && complementaryOptionId ? { optionId: complementaryOptionId, occupancyMode: complementaryGroup.occupancyMode, date, startTime: complementaryGroup.occupancyMode === "time_slot" ? (intent === "combined" ? selectedStartTime : complementaryStartTime) : null, endTime: complementaryGroup.occupancyMode === "time_slot" ? (intent === "combined" ? primaryEndTime : complementaryEndTime) : null } : null, customerName, customerWhatsapp })
        : editing && appointment
        ? await editAppointmentOccurrence(appointment.id, input!)
        : recurring
          ? await createRecurringAppointment({ ...input!, repeatCount: recurrenceType === "count" ? repeatCount : null })
          : await createManualAppointment(input!);
      if (!result.ok) { setMessage(result.message); return; }
      if ("appointments" in result.data) onSaved(result.data.appointments, date, result.message, result.data.complementaryReservations);
      else onSaved(result.data, date, result.message);
    });
  }

  return (
    <Modal title={editing ? "Editar agendamento" : "Novo agendamento"} onClose={onClose}>
      <div className="p-4 sm:p-5">
        {editing && appointment?.series ? <p className="mb-4 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-primary">Esta edição altera somente esta ocorrência. A série continua com a configuração original.</p> : null}
        {!editing && complementaryGroup ? <fieldset className="mb-4"><legend className="mb-2 text-sm font-semibold">O que deseja agendar?</legend><div className="grid gap-2 sm:grid-cols-3">{([['primary','Principal'],['complementary',complementaryGroup.intentName],['combined',`Principal + ${complementaryGroup.intentName}`]] as const).map(([value,label])=><button key={value} type="button" aria-pressed={intent===value} onClick={()=>{setIntent(value);setRecurring(false);setMessage(null);if(value==="complementary"){setSlots([]);setStartTime(null);setBlocks(1);}}} className={classes("focus-ring flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold",intent===value&&"border-primary bg-primary/10 text-primary")}><Check className={classes("h-4 w-4",intent!==value&&"invisible")}/>{label}</button>)}</div></fieldset> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label htmlFor="appointment-date">Data</Label><Input id="appointment-date" type="date" min={todayISO()} value={date} onChange={(event) => { setDate(event.target.value); setStartTime(null); setBlocks(1); }} /></div>
          {includesPrimary && groupOne ? <div className="space-y-1"><Label htmlFor="appointment-g1">{groupOne.label}</Label><Select id="appointment-g1" value={group1OptionId ?? ""} onChange={(event) => { setGroup1OptionId(event.target.value); setStartTime(null); setBlocks(1); }}>{groupOne.options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</Select></div> : null}
          {includesPrimary && groupTwo ? <div className="space-y-1"><Label htmlFor="appointment-g2">{groupTwo.label}</Label><Select id="appointment-g2" value={group2OptionId ?? ""} onChange={(event) => { setGroup2OptionId(event.target.value); setStartTime(null); setBlocks(1); }}>{groupTwo.options.map((option) => <option key={option.id} value={option.id}>{option.name}{config.durationMode === "group_2" ? ` · ${formatDuration(option.durationMinutes ?? 0)}` : ""}</option>)}</Select></div> : null}
          {includesComplementary && complementaryGroup?.occupancyMode === "time_slot" && intent === "complementary" ? <><div className="space-y-1"><Label htmlFor="complementary-start">Início</Label><Input id="complementary-start" type="time" value={complementaryStartTime} onChange={(event)=>setComplementaryStartTime(event.target.value)} /></div><div className="space-y-1"><Label htmlFor="complementary-end">Fim</Label><Input id="complementary-end" type="time" value={complementaryEndTime} onChange={(event)=>setComplementaryEndTime(event.target.value)} /></div></> : null}
          {includesComplementary && complementaryGroup ? <div className="space-y-1"><Label htmlFor="appointment-complementary">{complementaryGroup.label}</Label><Select id="appointment-complementary" value={complementaryOptionId ?? ""} onChange={(event)=>setComplementaryOptionId(event.target.value)}><option value="">Selecione</option>{complementaryGroup.options.map((option)=><option key={option.id} value={option.id} disabled={!availableComplementaryIds.includes(option.id)}>{option.name}{!availableComplementaryIds.includes(option.id)?" · indisponível":""}</option>)}</Select></div> : null}
          <div className="space-y-1"><Label htmlFor="appointment-customer">Cliente</Label><Input id="appointment-customer" maxLength={120} value={customerName} onChange={(event) => setCustomerName(event.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="appointment-whatsapp">WhatsApp</Label><Input id="appointment-whatsapp" inputMode="tel" maxLength={15} value={customerWhatsapp} onChange={(event) => setCustomerWhatsapp(formatWhatsappInput(event.target.value))} placeholder="(00) 00000-0000" /></div>
        </div>
        {includesPrimary ? <div className="mt-4"><p className="mb-2 text-sm font-medium">Horários disponíveis</p>{config.durationMode === "fixed_multiple" ? <p className="mb-3 text-xs text-muted">Selecione horários consecutivos para ampliar este agendamento. Toque no primeiro selecionado para limpar ou em outro selecionado para encurtar o intervalo.</p> : null}{loading ? <EmptyState className="flex items-center justify-center gap-2"><LoaderCircle className="h-4 w-4 animate-spin" />Consultando disponibilidade...</EmptyState> : slots.length ? <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">{slots.map((slot) => <button key={slot.startTime} type="button" aria-label={`Selecionar ${slot.startTime}`} aria-pressed={selectedTimes.includes(slot.startTime)} onClick={() => { if (config.durationMode === "fixed_multiple") { const next = selectFixedMultipleSlot(slots, startTime, blocks, slot.startTime); setStartTime(next.startTime); setBlocks(next.blocks); setSequenceMessage(next.rejected ? "Este horário não pode ser combinado. Selecione o próximo horário consecutivo disponível." : null); } else { setStartTime(slot.startTime); setBlocks(1); } }} className={classes("focus-ring flex min-h-11 items-center justify-center gap-1 rounded-xl border bg-card px-1 py-2 text-sm font-semibold tabular-nums hover:border-primary", selectedTimes.includes(slot.startTime) && "border-primary bg-primary text-white")}><span>{slot.startTime}</span>{selectedTimes.includes(slot.startTime) ? <Check aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /> : null}</button>)}</div> : <EmptyState>Nenhum horário disponível nesta data.</EmptyState>}</div> : complementaryGroup?.occupancyMode === "day" ? <p className="mt-4 rounded-xl border bg-surface/50 p-3 text-sm text-muted">Reserva válida durante todo o dia, sem horário artificial.</p> : null}
        {sequenceMessage ? <p role="status" className="mt-3 text-xs font-medium text-danger">{sequenceMessage}</p> : null}
        {includesPrimary && !loading && startTime && selectedSlot && config.durationMode === "fixed_multiple" ? <div role="status" className="mt-3 rounded-xl border border-primary/25 bg-primary/5 p-3"><p className="text-sm font-semibold tabular-nums">{startTime} → {fixedMultipleEndTime(startTime, selectedSlot.durationMinutes, blocks)}</p><p className="mt-1 text-xs text-muted">{blocks} {blocks === 1 ? "bloco" : "blocos"} · {formatDuration(selectedSlot.durationMinutes * blocks)} · Um único agendamento</p></div> : null}
        {outsideBusinessHours ? <p role="status" className="mt-4 flex items-start gap-2 rounded-xl border border-accent/40 bg-accent/10 p-3 text-sm text-foreground"><Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" /><span>Este horário está fora do funcionamento configurado. O agendamento será criado somente pelo Admin e não abrirá disponibilidade na página pública.</span></p> : null}
        {!editing && intent === "primary" ? <div className="mt-4 rounded-xl border bg-surface/50 p-4"><label className="flex cursor-pointer items-center gap-3 text-sm font-medium"><input type="checkbox" className="h-4 w-4 accent-primary" checked={recurring} onChange={(event) => setRecurring(event.target.checked)} />Repetir semanalmente</label>{recurring ? <div className="mt-4 space-y-3 border-t pt-4"><div className="grid gap-2 sm:grid-cols-2"><label className="flex items-center gap-2 rounded-xl border bg-background p-3 text-sm"><input type="radio" name="modal-recurrence" checked={recurrenceType === "permanent"} onChange={() => setRecurrenceType("permanent")} />Permanente</label><label className="flex items-center gap-2 rounded-xl border bg-background p-3 text-sm"><input type="radio" name="modal-recurrence" checked={recurrenceType === "count"} onChange={() => setRecurrenceType("count")} />Quantidade de repetições</label></div>{recurrenceType === "count" ? <Input type="number" min={2} max={260} value={repeatCount} onChange={(event) => setRepeatCount(Number(event.target.value))} /> : null}{startTime ? <p className="flex items-center gap-2 text-sm font-medium text-primary"><Repeat2 className="h-4 w-4" />{recurrenceSummary(date, startTime, recurrenceType === "count" ? repeatCount : null)}</p> : null}</div> : null}</div> : null}
        {startTime ? <p className="mt-4 text-sm text-muted">{formatLongDate(date)} · {startTime} · {duration ? formatDuration(duration) : "duração inválida"}</p> : null}
        {message ? <p role="alert" className="mt-4 whitespace-pre-line rounded-xl border border-danger/25 bg-danger/10 p-3 text-sm text-danger">{message}</p> : null}
        <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button disabled={saving || loading || (includesPrimary && (!startTime || !selectedSlot || !duration)) || (includesComplementary && !complementaryOptionId) || !customerName.trim() || !customerWhatsapp.trim() || (recurring && recurrenceType === "count" && repeatCount < 2)} onClick={submit}>{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}{saving ? "Salvando..." : editing ? "Salvar alterações" : recurring ? "Criar recorrência" : "Adicionar"}</Button></div>
      </div>
    </Modal>
  );
}
