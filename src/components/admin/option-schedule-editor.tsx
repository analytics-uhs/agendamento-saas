"use client";

import { useId, useRef, useState } from "react";
import { BusinessHoursEditor } from "@/components/business-hours-editor";
import { Button } from "@/components/ui/button";
import { validateOptionSchedule, type OptionSchedule } from "@/lib/option-schedule-form";
import type { ActionResult, BusinessHourForm } from "@/types/business";
import type { BookingOptionScheduleMode } from "@/types/database";

export function OptionScheduleEditor({ initial, onSave }: {
  initial: OptionSchedule;
  onSave: (mode: BookingOptionScheduleMode, hours: BusinessHourForm[]) => Promise<ActionResult>;
}) {
  const id = useId();
  const [mode, setMode] = useState(initial.mode);
  const [hours, setHours] = useState(initial.hours);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, setPending] = useState(false);
  const saving = useRef(false);
  const [dirty, setDirty] = useState(false);
  function changeMode(next: BookingOptionScheduleMode) {
    setMode(next); setDirty(true); setResult(null);
    // Keep the custom draft intact even while the inherited mode is selected.
  }
  async function save() {
    if (saving.current) return;
    const error = validateOptionSchedule(mode, hours);
    if (error) { setResult({ ok: false, message: error }); return; }
    saving.current = true; setPending(true); setResult(null);
    try {
      const response = await onSave(mode, hours);
      setResult(response);
      if (response.ok) {
        setDirty(false);
        if (mode === "custom") setHours((current) => current.map((day) => ({ ...day,
          windows: [...day.windows].sort((a, b) => a.startTime.localeCompare(b.startTime)),
        })));
      }
    } catch {
      setResult({ ok: false, message: "Não foi possível salvar os horários. Tente novamente; suas alterações foram mantidas." });
    } finally { saving.current = false; setPending(false); }
  }
  return <div className="space-y-4" aria-busy={pending}>
    <fieldset disabled={pending} className="min-w-0 space-y-3">
      <legend className="mb-3 text-sm font-semibold">Horário de disponibilidade</legend>
      {([['business', 'Usar horário do estabelecimento'], ['custom', 'Personalizar horários']] as const).map(([value, label]) => (
        <label key={value} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input type="radio" name={id} value={value} checked={mode === value} onChange={() => changeMode(value)} className="focus-ring h-4 w-4 shrink-0 accent-primary" />
          {label}
        </label>
      ))}
      {mode === "business" ? <p className="text-sm text-muted">Usa os mesmos horários definidos para o estabelecimento.</p> : <>
        <p className="text-sm text-muted">Defina os períodos de {initial.name}. Dias fechados não usam o horário do estabelecimento.</p>
        <p className="text-xs text-muted">Use 00:00 no fim de um período para encerrar à meia-noite.</p>
        <BusinessHoursEditor hours={hours} stackedInputs onChange={(updated) => {
            setHours(updated);
            setDirty(true); setResult(null);
          }} />
      </>}
    </fieldset>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        {result ? <p role={result.ok ? "status" : "alert"} className={result.ok ? "text-sm text-success" : "text-sm text-danger"}>{result.message}</p>
          : dirty ? <p className="text-xs text-muted">Alterações de horário ainda não salvas.</p> : null}
      </div>
      <Button disabled={pending} onClick={save} className="shrink-0">{pending ? "Salvando..." : "Salvar horários"}</Button>
    </div>
  </div>;
}
