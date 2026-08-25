"use client";

import { Ban, CalendarClock, LoaderCircle, Repeat2 } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  editCalendarBlock,
  loadCalendarBlockWindows,
  saveCalendarBlock,
} from "@/app/admin/calendar-block-actions";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import {
  calendarBlockEndTime,
  calendarBlockSlots,
  selectCalendarBlockSlot,
  toggleCalendarBlockResource,
} from "@/lib/calendar-blocks";
import { classes } from "@/lib/classes";
import { calendarSlotMinutes } from "@/lib/daily-calendar";
import { formatDuration, formatLongDate } from "@/lib/date";
import { endTimeToMinutes, timeToMinutes } from "@/lib/time-of-day";
import { recurrenceSummary } from "@/lib/recurrence";
import type {
  AppointmentSchedulingConfig,
  CalendarBlock,
} from "@/types/appointments";

export function CalendarBlockModal({
  config,
  initialDate,
  block = null,
  onClose,
  onSaved,
}: {
  config: AppointmentSchedulingConfig;
  initialDate: string;
  block?: CalendarBlock | null;
  onClose: () => void;
  onSaved: (blocks: CalendarBlock[], date: string, message: string) => void;
}) {
  const groupOne = config.groups.find((group) => group.position === 1);
  const step = calendarSlotMinutes(config);
  const [date, setDate] = useState(block?.blockDate ?? initialDate);
  const [resources, setResources] = useState<string[]>(
    block?.group1 ? [block.group1.id] : [],
  );
  const [selectedSlots, setSelectedSlots] = useState<string[]>(
    block ? [block.startTime] : [],
  );
  const [reason, setReason] = useState(block?.reason ?? "");
  const [recurring, setRecurring] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState<"permanent" | "count">("permanent");
  const [repeatCount, setRepeatCount] = useState(12);
  const [windows, setWindows] = useState<{ startTime: string; endTime: string }[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [loadingWindows, startWindowsTransition] = useTransition();
  const [saving, startSavingTransition] = useTransition();
  const slots = useMemo(() => calendarBlockSlots(windows, step), [windows, step]);
  const endTime = calendarBlockEndTime(selectedSlots, step);

  useEffect(() => {
    startWindowsTransition(async () => {
      const result = await loadCalendarBlockWindows(date);
      if (result.ok) {
        setWindows(result.data);
        if (block && date === block.blockDate) {
          const available = calendarBlockSlots(result.data, step);
          const start = available.indexOf(block.startTime);
          const end = available.findIndex((time) => timeToMinutes(time) >= endTimeToMinutes(block.endTime));
          setSelectedSlots(start >= 0 ? available.slice(start, end < 0 ? undefined : end) : []);
        } else setSelectedSlots([]);
      } else setFeedback(result.message);
    });
  }, [block, date, step]);

  const needsResource = Boolean(groupOne);
  const valid = Boolean(
    selectedSlots.length && endTime && (!needsResource || resources.length) &&
      (!recurring || recurrenceType === "permanent" || repeatCount >= 2),
  );

  function submit() {
    if (!valid || !endTime) return;
    setFeedback(null);
    startSavingTransition(async () => {
      const result = block
        ? await editCalendarBlock(block.id, {
            date,
            startTime: selectedSlots[0],
            endTime,
            reason,
          })
        : await saveCalendarBlock({
            date,
            startTime: selectedSlots[0],
            endTime,
            reason,
            group1OptionIds: resources,
            recurring,
            repeatCount: recurring && recurrenceType === "count" ? repeatCount : null,
          });
      if (!result.ok) setFeedback(result.message);
      else onSaved(result.data, date, result.message);
    });
  }

  return (
    <Modal title={block ? "Editar bloqueio" : "Novo bloqueio"} onClose={onClose}>
      <div className="space-y-5 p-4 sm:p-5">
        <div className="rounded-xl border bg-surface/45 p-3">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Ban className="h-4 w-4 text-primary" />
            Período indisponível
          </p>
          <p className="mt-1 text-xs text-muted">
            Bloqueios impedem novos agendamentos, mas nunca cancelam os já existentes.
          </p>
        </div>

        <div className="space-y-1">
          <Label htmlFor="block-date">Data</Label>
          <Input id="block-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </div>

        {groupOne && !block ? (
          <fieldset>
            <div className="flex items-center justify-between gap-3">
              <legend className="text-sm font-medium">{groupOne.label}</legend>
              <button type="button" className="focus-ring rounded text-xs font-semibold text-primary" onClick={() => setResources(resources.length === groupOne.options.length ? [] : groupOne.options.map((option) => option.id))}>
                {resources.length === groupOne.options.length ? "Limpar" : "Selecionar todos"}
              </button>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {groupOne.options.map((option) => (
                <label key={option.id} className={classes("flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border bg-background px-3 py-2 text-sm", resources.includes(option.id) && "border-primary bg-primary/5")}>
                  <input type="checkbox" className="h-4 w-4 accent-primary" checked={resources.includes(option.id)} onChange={() => setResources(toggleCalendarBlockResource(resources, option.id))} />
                  {option.name}
                </label>
              ))}
            </div>
          </fieldset>
        ) : block?.group1 ? (
          <p className="text-sm"><span className="text-muted">{block.group1.label}:</span> <span className="font-medium">{block.group1.name}</span></p>
        ) : null}

        <div>
          <p className="text-sm font-medium">Horários consecutivos</p>
          <p className="mt-1 text-xs text-muted">Toque no início e depois no último bloco do período.</p>
          {loadingWindows ? (
            <EmptyState className="mt-3"><LoaderCircle className="mx-auto mb-2 h-4 w-4 animate-spin" />Carregando horários...</EmptyState>
          ) : slots.length ? (
            <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
              {slots.map((slot) => (
                <button key={slot} type="button" onClick={() => setSelectedSlots(selectCalendarBlockSlot(slots, selectedSlots, slot))} className={classes("focus-ring min-h-11 rounded-xl border bg-card px-2 text-sm font-semibold tabular-nums", selectedSlots.includes(slot) && "border-primary bg-primary text-white")}>
                  {slot}
                </button>
              ))}
            </div>
          ) : <EmptyState className="mt-3">Não há horário de funcionamento nesta data.</EmptyState>}
          {selectedSlots.length && endTime ? (
            <p className="mt-3 flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm font-medium text-primary">
              <CalendarClock className="h-4 w-4" />
              {selectedSlots[0]}–{endTime} · {formatDuration(selectedSlots.length * step)}
            </p>
          ) : null}
        </div>

        <div className="space-y-1">
          <Label htmlFor="block-reason">Motivo (opcional)</Label>
          <Input id="block-reason" value={reason} maxLength={160} onChange={(event) => setReason(event.target.value)} placeholder="Ex.: manutenção, reunião, evento" />
        </div>

        {!block ? (
          <div className="rounded-xl border bg-surface/45 p-4">
            <label className="flex cursor-pointer items-center gap-3 text-sm font-medium">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={recurring} onChange={(event) => setRecurring(event.target.checked)} />
              Repetir semanalmente
            </label>
            {recurring ? (
              <div className="mt-4 space-y-3 border-t pt-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  {(["permanent", "count"] as const).map((type) => (
                    <label key={type} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border bg-background p-3 text-sm">
                      <input type="radio" name="block-recurrence" className="accent-primary" checked={recurrenceType === type} onChange={() => setRecurrenceType(type)} />
                      {type === "permanent" ? "Permanente" : "Quantidade de repetições"}
                    </label>
                  ))}
                </div>
                {recurrenceType === "count" ? <div className="max-w-xs space-y-1"><Label htmlFor="block-repeat-count">Número de repetições</Label><Input id="block-repeat-count" type="number" min={2} max={260} value={repeatCount} onChange={(event) => setRepeatCount(Number(event.target.value))} /></div> : null}
                {selectedSlots.length ? <p className="flex items-center gap-2 text-sm font-medium text-primary"><Repeat2 className="h-4 w-4" />{recurrenceSummary(date, selectedSlots[0], recurrenceType === "count" ? repeatCount : null)}</p> : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {feedback ? <p role="status" className="whitespace-pre-line rounded-xl border border-danger/25 bg-danger/10 p-3 text-sm text-danger">{feedback}</p> : null}

        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <p className="hidden text-xs text-muted sm:block">{formatLongDate(date)}</p>
          <div className="ml-auto flex gap-2"><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button disabled={!valid || saving} onClick={submit}>{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}{saving ? "Salvando..." : block ? "Salvar" : "Criar bloqueio"}</Button></div>
        </div>
      </div>
    </Modal>
  );
}
