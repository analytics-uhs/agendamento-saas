"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { nextBusinessHourWindow } from "@/lib/business-form";
import { endsNextDay } from "@/lib/time-of-day";
import { classes } from "@/lib/classes";
import type { BusinessHourForm } from "@/types/business";

export function BusinessHourDay({ hour, onChange, compact = false, stackedInputs = false }: { hour: BusinessHourForm; onChange: (hour: BusinessHourForm) => void; compact?: boolean; stackedInputs?: boolean }) {
  const nextWindow = nextBusinessHourWindow(hour.windows);
  function toggle(active: boolean) {
    onChange({ ...hour, active, windows: active && hour.windows.length === 0 ? [{ startTime: "08:00", endTime: "18:00" }] : hour.windows });
  }
  function removeWindow(index: number) {
    const windows = hour.windows.filter((_, windowIndex) => windowIndex !== index);
    onChange({ ...hour, windows, active: windows.length > 0 ? hour.active : false });
  }

  return <div className={compact ? "rounded-xl border p-3" : "p-4"}>
    <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><Switch checked={hour.active} onChange={toggle} label={`Ativar ${hour.label}`} /><div><p className="text-sm font-medium">{hour.label}</p><p className="text-xs text-muted">{hour.active && hour.windows.length ? `${hour.windows.length} ${hour.windows.length === 1 ? "período" : "períodos"}` : "Fechado"}</p></div></div></div>
    {hour.active ? <div className="mt-3 space-y-2 sm:ml-11">{hour.windows.map((window, index) => <div key={window.id ?? index} className={classes("grid items-center gap-2", stackedInputs ? "grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto]" : "grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto]")}><Input className={stackedInputs ? "col-span-2 sm:col-span-1" : undefined} aria-label={`Início de ${hour.label}, período ${index + 1}`} type="time" value={window.startTime} onChange={(event) => onChange({ ...hour, windows: hour.windows.map((item, itemIndex) => itemIndex === index ? { ...item, startTime: event.target.value } : item) })} /><span className={classes("text-xs text-muted", stackedInputs && "col-span-2 sm:col-span-1")}>até</span><Input aria-label={`Fim de ${hour.label}, período ${index + 1}`} type="time" value={window.endTime} onChange={(event) => onChange({ ...hour, windows: hour.windows.map((item, itemIndex) => itemIndex === index ? { ...item, endTime: event.target.value } : item) })} /><Button variant="ghost" size="icon" aria-label={`Remover período ${index + 1} de ${hour.label}`} onClick={() => removeWindow(index)}><Trash2 className="h-4 w-4" /></Button>{endsNextDay(window.startTime, window.endTime) ? <p className="col-span-full text-xs text-muted">Horário termina no dia seguinte.</p> : null}</div>)}
      <Button variant="ghost" size="sm" disabled={!nextWindow} title={nextWindow ? undefined : "Não há espaço livre para outro período"} onClick={() => nextWindow && onChange({ ...hour, windows: [...hour.windows, nextWindow] })}><Plus className="h-4 w-4" />Adicionar horário</Button>
    </div> : null}
  </div>;
}
