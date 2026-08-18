"use client";

import { Copy } from "lucide-react";
import { useState, useTransition } from "react";
import { saveHours } from "@/app/admin/actions";
import { PageHeading } from "@/components/admin/page-heading";
import { SaveNotice } from "@/components/admin/save-notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import type { ActionResult, BusinessHourForm } from "@/types/business";

export function BusinessHours({ initialHours }: { initialHours: BusinessHourForm[] }) {
  const [hours, setHours] = useState(initialHours);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const monday = hours.find((hour) => hour.weekday === 1);
  const updateHour = (weekday: number, patch: Partial<BusinessHourForm>) => setHours((current) => current.map((hour) => hour.weekday === weekday ? { ...hour, ...patch } : hour));

  return <><PageHeading title="Horários" description="Defina quando novos horários podem ser reservados." /><section className="mt-6 overflow-hidden rounded-xl border bg-background"><div className="flex items-center justify-between gap-3 border-b p-4"><div><h2 className="text-sm font-semibold">Horários de funcionamento</h2><p className="text-xs text-muted">A disponibilidade pública respeita estes períodos.</p></div><Button variant="outline" size="sm" disabled={!monday} onClick={() => monday && setHours((current) => current.map((hour) => hour.weekday === 1 ? hour : { ...hour, startTime: monday.startTime, endTime: monday.endTime }))}><Copy className="h-4 w-4" />Copiar segunda</Button></div><div className="divide-y">{hours.map((hour) => <div key={hour.weekday} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center"><div className="flex items-center gap-3"><Switch checked={hour.active} onChange={(active) => updateHour(hour.weekday, { active })} label={`Ativar ${hour.label}`} /><div><p className="text-sm font-medium">{hour.label}</p><p className="text-xs text-muted">{hour.active ? "Aberto" : "Fechado"}</p></div></div><div className="grid grid-cols-2 gap-2"><Input aria-label={`Início de ${hour.label}`} type="time" disabled={!hour.active} value={hour.startTime} onChange={(event) => updateHour(hour.weekday, { startTime: event.target.value })} /><Input aria-label={`Fim de ${hour.label}`} type="time" disabled={!hour.active} value={hour.endTime} onChange={(event) => updateHour(hour.weekday, { endTime: event.target.value })} /></div></div>)}</div></section>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><SaveNotice result={result} /><Button disabled={pending} onClick={() => startTransition(async () => setResult(await saveHours(hours)))}>{pending ? "Salvando..." : "Salvar horários"}</Button></div>
  </>;
}
