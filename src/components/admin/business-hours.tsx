"use client";

import { useState, useTransition } from "react";
import { saveHours } from "@/app/admin/actions";
import { PageHeader } from "@/components/ui/page-header";
import { BusinessHoursEditor } from "@/components/business-hours-editor";
import { SaveNotice } from "@/components/admin/save-notice";
import { Button } from "@/components/ui/button";
import type { ActionResult, BusinessHourForm } from "@/types/business";

export function BusinessHours({ initialHours }: { initialHours: BusinessHourForm[] }) {
  const [hours, setHours] = useState(initialHours);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  return <><PageHeader title="Horários" description="Defina quando novos horários podem ser reservados." /><section className="mt-6 space-y-3"><div><h2 className="text-sm font-semibold">Horários de funcionamento</h2><p className="text-xs text-muted">Adicione períodos separados para almoço ou turnos.</p></div><BusinessHoursEditor hours={hours} onChange={setHours} /></section>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><SaveNotice result={result} /><Button disabled={pending} onClick={() => startTransition(async () => setResult(await saveHours(hours)))}>{pending ? "Salvando..." : "Salvar horários"}</Button></div>
  </>;
}
