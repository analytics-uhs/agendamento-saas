"use client";

import { Copy } from "lucide-react";
import { useState, useTransition } from "react";
import { saveHours } from "@/app/admin/actions";
import { PageHeader } from "@/components/ui/page-header";
import { BusinessHourDay } from "@/components/business-hour-day";
import { SaveNotice } from "@/components/admin/save-notice";
import { Button } from "@/components/ui/button";
import { cloneBusinessHourWindows } from "@/lib/business-form";
import type { ActionResult, BusinessHourForm } from "@/types/business";

export function BusinessHours({ initialHours }: { initialHours: BusinessHourForm[] }) {
  const [hours, setHours] = useState(initialHours);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const monday = hours.find((hour) => hour.weekday === 1);
  const updateHour = (updated: BusinessHourForm) => setHours((current) => current.map((hour) => hour.weekday === updated.weekday ? updated : hour));

  return <><PageHeader title="Horários" description="Defina quando novos horários podem ser reservados." /><section className="mt-6 overflow-hidden rounded-xl border bg-background"><div className="flex items-center justify-between gap-3 border-b p-4"><div><h2 className="text-sm font-semibold">Horários de funcionamento</h2><p className="text-xs text-muted">Adicione períodos separados para almoço ou turnos.</p></div><Button variant="outline" size="sm" disabled={!monday} onClick={() => monday && setHours((current) => current.map((hour) => hour.weekday === 1 ? hour : { ...hour, active: monday.active, windows: cloneBusinessHourWindows(monday.windows) }))}><Copy className="h-4 w-4" />Copiar segunda</Button></div><div className="divide-y">{hours.map((hour) => <BusinessHourDay key={hour.weekday} hour={hour} onChange={updateHour} />)}</div></section>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><SaveNotice result={result} /><Button disabled={pending} onClick={() => startTransition(async () => setResult(await saveHours(hours)))}>{pending ? "Salvando..." : "Salvar horários"}</Button></div>
  </>;
}
