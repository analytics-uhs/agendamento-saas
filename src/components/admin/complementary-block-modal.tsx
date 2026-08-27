"use client";

import { Ban, LoaderCircle, Repeat2 } from "lucide-react";
import { useState, useTransition } from "react";
import { saveResourceBlock } from "@/app/admin/calendar-block-actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { classes } from "@/lib/classes";
import { recurrenceSummary } from "@/lib/recurrence";
import { endTimeToMinutes, timeToMinutes } from "@/lib/time-of-day";
import type { AppointmentSchedulingConfig, ResourceBlock } from "@/types/appointments";

export function ComplementaryBlockModal({ config, initialDate, onClose, onSaved }: { config: AppointmentSchedulingConfig; initialDate: string; onClose: () => void; onSaved: (blocks: ResourceBlock[], date: string, message: string) => void }) {
  const group = config.complementaryGroup!;
  const [date, setDate] = useState(initialDate);
  const [optionIds, setOptionIds] = useState<string[]>([]);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("09:00");
  const [reason, setReason] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState<"permanent" | "count">("permanent");
  const [repeatCount, setRepeatCount] = useState(12);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [saving, startTransition] = useTransition();
  const valid = optionIds.length > 0 && (group.occupancyMode === "day" || timeToMinutes(startTime) < endTimeToMinutes(endTime)) && (!recurring || recurrenceType === "permanent" || repeatCount >= 2);
  function toggle(id: string) { setOptionIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }
  function submit() { if (!valid) return; startTransition(async () => { const result = await saveResourceBlock({ optionIds, date, startTime: group.occupancyMode === "day" ? null : startTime, endTime: group.occupancyMode === "day" ? null : endTime, reason, recurring, repeatCount: recurring && recurrenceType === "count" ? repeatCount : null }); if (!result.ok) setFeedback(result.message); else onSaved(result.data, date, result.message); }); }
  return <Modal title={`Bloquear ${group.intentName}`} onClose={onClose}><div className="space-y-5 p-4 sm:p-5">
    <div className="rounded-xl border bg-surface/45 p-3"><p className="flex items-center gap-2 text-sm font-semibold"><Ban className="h-4 w-4 text-primary"/>Recurso indisponível</p><p className="mt-1 text-xs text-muted">Reservas existentes permanecem intactas. Novas reservas serão impedidas.</p></div>
    <div className="space-y-1"><Label htmlFor="resource-block-date">Data</Label><Input id="resource-block-date" type="date" value={date} onChange={(event) => setDate(event.target.value)}/></div>
    <fieldset><div className="flex items-center justify-between gap-3"><legend className="text-sm font-medium">{group.label}</legend><button type="button" className="focus-ring rounded text-xs font-semibold text-primary" onClick={() => setOptionIds(optionIds.length === group.options.length ? [] : group.options.map((option) => option.id))}>{optionIds.length === group.options.length ? "Limpar" : "Selecionar todos"}</button></div><div className="mt-2 grid gap-2 sm:grid-cols-2">{group.options.map((option) => <label key={option.id} className={classes("flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border bg-background px-3 py-2 text-sm", optionIds.includes(option.id) && "border-primary bg-primary/5")}><input type="checkbox" className="h-4 w-4 accent-primary" checked={optionIds.includes(option.id)} onChange={() => toggle(option.id)}/>{option.name}</label>)}</div></fieldset>
    {group.occupancyMode === "time_slot" ? <div className="grid grid-cols-2 gap-3"><div className="space-y-1"><Label htmlFor="resource-block-start">Início</Label><Input id="resource-block-start" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)}/></div><div className="space-y-1"><Label htmlFor="resource-block-end">Fim</Label><Input id="resource-block-end" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)}/></div></div> : <p className="rounded-xl bg-primary/10 px-3 py-2 text-sm font-medium text-primary">O dia inteiro ficará indisponível para os recursos selecionados.</p>}
    <div className="space-y-1"><Label htmlFor="resource-block-reason">Motivo (opcional)</Label><Input id="resource-block-reason" value={reason} maxLength={160} onChange={(event) => setReason(event.target.value)} placeholder="Ex.: manutenção, uso interno"/></div>
    <div className="rounded-xl border bg-surface/45 p-4"><label className="flex cursor-pointer items-center gap-3 text-sm font-medium"><input type="checkbox" className="h-4 w-4 accent-primary" checked={recurring} onChange={(event) => setRecurring(event.target.checked)}/>Repetir semanalmente</label>{recurring ? <div className="mt-4 space-y-3 border-t pt-4"><div className="grid gap-2 sm:grid-cols-2">{(["permanent", "count"] as const).map((type) => <label key={type} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border bg-background p-3 text-sm"><input type="radio" name="resource-block-recurrence" className="accent-primary" checked={recurrenceType === type} onChange={() => setRecurrenceType(type)}/>{type === "permanent" ? "Permanente" : "Quantidade de repetições"}</label>)}</div>{recurrenceType === "count" ? <div className="max-w-xs space-y-1"><Label htmlFor="resource-repeat-count">Número de repetições</Label><Input id="resource-repeat-count" type="number" min={2} max={260} value={repeatCount} onChange={(event) => setRepeatCount(Number(event.target.value))}/></div> : null}<p className="flex items-center gap-2 text-sm font-medium text-primary"><Repeat2 className="h-4 w-4"/>{recurrenceSummary(date, group.occupancyMode === "day" ? "00:00" : startTime, recurrenceType === "count" ? repeatCount : null)}</p></div> : null}</div>
    {feedback ? <p role="status" className="whitespace-pre-line rounded-xl border border-danger/25 bg-danger/10 p-3 text-sm text-danger">{feedback}</p> : null}
    <div className="flex justify-end gap-2 border-t pt-4"><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button disabled={!valid || saving} onClick={submit}>{saving ? <LoaderCircle className="h-4 w-4 animate-spin"/> : null}{saving ? "Salvando..." : "Criar bloqueio"}</Button></div>
  </div></Modal>;
}
