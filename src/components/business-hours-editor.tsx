"use client";

import { Copy } from "lucide-react";
import { useState } from "react";
import { BusinessHourDay } from "@/components/business-hour-day";
import { Button } from "@/components/ui/button";
import { overwrittenBusinessDays, repeatBusinessHours } from "@/lib/repeat-business-hours";
import type { BusinessHourForm } from "@/types/business";

/** Same weekly editing and copying flow for business and primary-option hours. */
export function BusinessHoursEditor({ hours, onChange, stackedInputs = false }: {
  hours: BusinessHourForm[];
  onChange: (hours: BusinessHourForm[]) => void;
  stackedInputs?: boolean;
}) {
  const [source, setSource] = useState<number | null>(null);
  const [targets, setTargets] = useState<number[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [notice, setNotice] = useState("");
  const overwritten = source === null ? [] : overwrittenBusinessDays(hours, source, targets);
  return <div className="divide-y rounded-xl border">
    {hours.map((hour) => <div key={hour.weekday}>
      <BusinessHourDay hour={hour} stackedInputs={stackedInputs} onChange={(updated) => {
        setConfirmed(false); setNotice(""); onChange(hours.map((day) => day.weekday === updated.weekday ? updated : day));
      }} />
      <div className="px-4 pb-4">
        <Button variant="ghost" size="sm" aria-expanded={source === hour.weekday}
          aria-label={`Repetir horários de ${hour.label} nos outros dias`} onClick={() => {
            setSource(source === hour.weekday ? null : hour.weekday); setTargets([]); setConfirmed(false); setNotice("");
          }}><Copy className="h-4 w-4" />Repetir nos outros dias</Button>
        {source === hour.weekday ? <fieldset className="mt-2 space-y-3 rounded-lg bg-surface p-3">
          <legend className="text-sm font-medium">Aplicar {hour.active ? `horários de ${hour.label}` : "Fechado"} também em</legend>
          <div className="grid grid-cols-2 gap-x-3">
            {hours.filter((day) => day.weekday !== source).map((day) => <label key={day.weekday} className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" className="focus-ring h-4 w-4 accent-primary" checked={targets.includes(day.weekday)} onChange={(event) => {
                setTargets(event.target.checked ? [...targets, day.weekday] : targets.filter((value) => value !== day.weekday)); setConfirmed(false);
              }} />{day.label}
            </label>)}
          </div>
          {overwritten.length ? <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="focus-ring mt-1 h-4 w-4 shrink-0 accent-primary" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
            <span>Substituir os horários existentes de {overwritten.map((day) => day.label).join(", ")}.</span>
          </label> : null}
          <p className="text-xs text-muted">A alteração só será salva ao clicar em Salvar horários.</p>
          <div className="flex gap-2">
            <Button size="sm" disabled={!targets.length || Boolean(overwritten.length && !confirmed)} onClick={() => {
              onChange(repeatBusinessHours(hours, source, targets)); setSource(null); setNotice("Horários repetidos. Salve para confirmar as alterações.");
            }}>Aplicar</Button>
            <Button size="sm" variant="ghost" onClick={() => setSource(null)}>Cancelar</Button>
          </div>
        </fieldset> : null}
      </div>
    </div>)}
    {notice ? <p role="status" className="p-4 text-sm text-muted">{notice}</p> : null}
  </div>;
}
