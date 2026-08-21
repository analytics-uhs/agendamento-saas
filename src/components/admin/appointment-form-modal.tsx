"use client";

import { LoaderCircle, Repeat2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import {
  createManualAppointment,
  createRecurringAppointment,
  editAppointmentOccurrence,
  loadAdminEditAvailability,
  loadAdminAvailability,
} from "@/app/admin/agenda/actions";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { manualAppointmentDuration } from "@/lib/appointments";
import { classes } from "@/lib/classes";
import { formatDuration, formatLongDate, todayISO } from "@/lib/date";
import { recurrenceSummary } from "@/lib/recurrence";
import type { AdminAppointment, AppointmentSchedulingConfig } from "@/types/appointments";
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
  onSaved: (appointments: AdminAppointment[], date: string, message: string) => void;
}) {
  const groupOne = config.groups.find((group) => group.position === 1);
  const groupTwo = config.groups.find((group) => group.position === 2);
  const editing = Boolean(appointment);
  const [date, setDate] = useState(appointment?.appointmentDate ?? prefill.date);
  const [group1OptionId, setGroup1OptionId] = useState<string | null>(appointment?.group1?.id ?? prefill.group1OptionId ?? groupOne?.options[0]?.id ?? null);
  const [group2OptionId, setGroup2OptionId] = useState<string | null>(appointment?.group2?.id ?? groupTwo?.options[0]?.id ?? null);
  const [customerName, setCustomerName] = useState(appointment?.customerName ?? "");
  const [customerWhatsapp, setCustomerWhatsapp] = useState(appointment?.customerWhatsapp ?? "");
  const [startTime, setStartTime] = useState<string | null>(appointment?.startTime ?? prefill.startTime ?? null);
  const [blocks, setBlocks] = useState(() => appointment ? Math.max(1, Math.round(appointment.durationMinutes / (config.durationMode === "group_2" ? (groupTwo?.options.find((option) => option.id === appointment.group2?.id)?.durationMinutes ?? appointment.durationMinutes) : config.fixedDurationMinutes))) : 1);
  const [recurring, setRecurring] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState<"permanent" | "count">("permanent");
  const [repeatCount, setRepeatCount] = useState(12);
  const [slots, setSlots] = useState<BookingSlot[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [saving, startSaving] = useTransition();

  useEffect(() => {
    startLoading(async () => {
      const result = appointment
        ? await loadAdminEditAvailability(appointment.id, { date, group1OptionId, group2OptionId })
        : await loadAdminAvailability({ date, group1OptionId, group2OptionId });
      if (!result.ok) { setSlots([]); setMessage(result.message); return; }
      const next = result.data;
      setSlots(next);
      setMessage(null);
      setStartTime((current) =>
        current && next.some((slot) => slot.startTime === current) ? current : null,
      );
    });
  }, [appointment, date, group1OptionId, group2OptionId]);

  const selectedSlot = slots.find((slot) => slot.startTime === startTime);
  const group2Duration = groupTwo?.options.find((option) => option.id === group2OptionId)?.durationMinutes ?? null;
  const duration = manualAppointmentDuration({ mode: config.durationMode, fixedDurationMinutes: config.fixedDurationMinutes, group2DurationMinutes: group2Duration, blocks });

  function submit() {
    if (!startTime) return;
    startSaving(async () => {
      const input = { group1OptionId, group2OptionId, date, startTime, blocks, customerName, customerWhatsapp };
      const result = editing && appointment
        ? await editAppointmentOccurrence(appointment.id, input)
        : recurring
          ? await createRecurringAppointment({ ...input, repeatCount: recurrenceType === "count" ? repeatCount : null })
          : await createManualAppointment(input);
      if (!result.ok) { setMessage(result.message); return; }
      onSaved(result.data, date, result.message);
    });
  }

  return (
    <Modal title={editing ? "Editar agendamento" : "Novo agendamento"} onClose={onClose}>
      <div className="p-4 sm:p-5">
        {editing && appointment?.series ? <p className="mb-4 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-primary">Esta edição altera somente esta ocorrência. A série continua com a configuração original.</p> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label htmlFor="appointment-date">Data</Label><Input id="appointment-date" type="date" min={todayISO()} value={date} onChange={(event) => { setDate(event.target.value); setStartTime(null); }} /></div>
          {groupOne ? <div className="space-y-1"><Label htmlFor="appointment-g1">{groupOne.label}</Label><Select id="appointment-g1" value={group1OptionId ?? ""} onChange={(event) => { setGroup1OptionId(event.target.value); setStartTime(null); setBlocks(1); }}>{groupOne.options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</Select></div> : null}
          {groupTwo ? <div className="space-y-1"><Label htmlFor="appointment-g2">{groupTwo.label}</Label><Select id="appointment-g2" value={group2OptionId ?? ""} onChange={(event) => { setGroup2OptionId(event.target.value); setStartTime(null); setBlocks(1); }}>{groupTwo.options.map((option) => <option key={option.id} value={option.id}>{option.name}{config.durationMode === "group_2" ? ` · ${formatDuration(option.durationMinutes ?? 0)}` : ""}</option>)}</Select></div> : null}
          <div className="space-y-1"><Label htmlFor="appointment-customer">Cliente</Label><Input id="appointment-customer" maxLength={120} value={customerName} onChange={(event) => setCustomerName(event.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="appointment-whatsapp">WhatsApp</Label><Input id="appointment-whatsapp" inputMode="tel" value={customerWhatsapp} onChange={(event) => setCustomerWhatsapp(event.target.value)} /></div>
        </div>
        <div className="mt-4"><p className="mb-2 text-sm font-medium">Horário</p>{loading ? <p className="flex items-center justify-center gap-2 rounded-xl border border-dashed p-5 text-sm text-muted"><LoaderCircle className="h-4 w-4 animate-spin" />Consultando disponibilidade...</p> : slots.length ? <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">{slots.map((slot) => <button key={slot.startTime} type="button" onClick={() => { setStartTime(slot.startTime); setBlocks(1); }} className={classes("focus-ring rounded-xl border bg-card py-2.5 text-sm font-semibold", startTime === slot.startTime && "border-primary bg-primary text-white")}>{slot.startTime}</button>)}</div> : <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted">Nenhum horário disponível nesta data.</p>}</div>
        {startTime && selectedSlot && config.durationMode === "fixed_multiple" ? <div className="mt-4"><p className="mb-2 text-xs font-medium text-muted">Duração a partir de {startTime}</p><div className="flex flex-wrap gap-2">{Array.from({ length: selectedSlot.maxBlocks }, (_, index) => index + 1).map((value) => <button key={value} type="button" onClick={() => setBlocks(value)} className={classes("focus-ring rounded-xl border bg-card px-4 py-2 text-sm font-semibold", blocks === value && "border-primary bg-primary text-white")}>{formatDuration(selectedSlot.durationMinutes * value)}</button>)}</div></div> : null}
        {!editing ? <div className="mt-4 rounded-xl border bg-surface/50 p-4"><label className="flex cursor-pointer items-center gap-3 text-sm font-medium"><input type="checkbox" className="h-4 w-4 accent-primary" checked={recurring} onChange={(event) => setRecurring(event.target.checked)} />Repetir semanalmente</label>{recurring ? <div className="mt-4 space-y-3 border-t pt-4"><div className="grid gap-2 sm:grid-cols-2"><label className="flex items-center gap-2 rounded-xl border bg-background p-3 text-sm"><input type="radio" name="modal-recurrence" checked={recurrenceType === "permanent"} onChange={() => setRecurrenceType("permanent")} />Permanente</label><label className="flex items-center gap-2 rounded-xl border bg-background p-3 text-sm"><input type="radio" name="modal-recurrence" checked={recurrenceType === "count"} onChange={() => setRecurrenceType("count")} />Quantidade de repetições</label></div>{recurrenceType === "count" ? <Input type="number" min={2} max={260} value={repeatCount} onChange={(event) => setRepeatCount(Number(event.target.value))} /> : null}{startTime ? <p className="flex items-center gap-2 text-sm font-medium text-primary"><Repeat2 className="h-4 w-4" />{recurrenceSummary(date, startTime, recurrenceType === "count" ? repeatCount : null)}</p> : null}</div> : null}</div> : null}
        {startTime ? <p className="mt-4 text-sm text-muted">{formatLongDate(date)} · {startTime} · {duration ? formatDuration(duration) : "duração inválida"}</p> : null}
        {message ? <p role="alert" className="mt-4 whitespace-pre-line rounded-xl border border-danger/25 bg-danger/10 p-3 text-sm text-danger">{message}</p> : null}
        <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button disabled={saving || !startTime || !customerName.trim() || !customerWhatsapp.trim() || !duration || (recurring && recurrenceType === "count" && repeatCount < 2)} onClick={submit}>{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}{saving ? "Salvando..." : editing ? "Salvar alterações" : recurring ? "Criar recorrência" : "Adicionar"}</Button></div>
      </div>
    </Modal>
  );
}
