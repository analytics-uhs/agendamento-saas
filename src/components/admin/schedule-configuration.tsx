"use client";

import { useState, useTransition } from "react";
import { saveSchedule } from "@/app/admin/actions";
import { BookingGroupEditor } from "@/components/booking-group-editor";
import { PageHeader } from "@/components/ui/page-header";
import { SaveNotice } from "@/components/admin/save-notice";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/field";
import { classes } from "@/lib/classes";
import { bookingGroupPosition } from "@/lib/booking-groups";
import type { ActionResult, BusinessForm } from "@/types/business";
import type { DurationMode } from "@/types/database";

const modes: { id: DurationMode; title: string; description: string }[] = [
  { id: "fixed", title: "Duração fixa", description: "Um bloco com a mesma duração para todos." },
  { id: "fixed_multiple", title: "Duração fixa + múltiplos blocos", description: "O cliente escolhe um ou mais blocos consecutivos." },
  { id: "group_2", title: "Duração pelo Grupo secundário", description: "Cada opção do Grupo secundário define a sua duração." },
];

export function ScheduleConfiguration({ initialBusiness }: { initialBusiness: BusinessForm }) {
  const [groups, setGroups] = useState(initialBusiness.groups);
  const [durationMode, setDurationMode] = useState(initialBusiness.durationMode);
  const [fixedDurationMinutes, setFixedDurationMinutes] = useState(initialBusiness.fixedDurationMinutes);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const setGroup = (index: number, group: BusinessForm["groups"][number]) => setGroups((current) => current.map((item, groupIndex) => groupIndex === index ? group : item) as typeof current);

  return <><PageHeader title="Configuração da agenda" description="Defina os grupos exibidos e como a duração é calculada." /><div className="mt-6 space-y-6">
    {groups.map((group, index) => (
      <BookingGroupEditor
        key={group.position}
        group={group}
        showDuration={group.position === bookingGroupPosition("secondary") && durationMode === "group_2"}
        onChange={(updated) => setGroup(index, updated)}
      />
    ))}
    <Card as="section" padding="md"><h2 className="text-sm font-semibold">Modo de duração</h2><p className="mt-1 text-xs text-muted">Existem somente os três modos abaixo.</p><div className="mt-4 grid gap-3 md:grid-cols-3">{modes.map((mode) => <button key={mode.id} type="button" onClick={() => setDurationMode(mode.id)} className={classes("focus-ring rounded-xl border p-4 text-left", durationMode === mode.id && "border-primary bg-primary/5")}><span className="text-sm font-semibold">{mode.id === "group_2" ? `Duração pelo ${groups[1].label}` : mode.title}</span><span className="mt-1 block text-xs text-muted">{mode.description}</span></button>)}</div>
      {durationMode !== "group_2" ? <div className="mt-5 border-t pt-4"><Label>Duração do bloco</Label><div className="mt-2 flex flex-wrap gap-2">{[30, 45, 60].map((minutes) => <button key={minutes} type="button" onClick={() => setFixedDurationMinutes(minutes)} className={classes("focus-ring rounded-lg border px-4 py-2 text-sm font-medium", fixedDurationMinutes === minutes && "border-primary bg-primary text-white")}>{minutes} min</button>)}<Input aria-label="Duração personalizada" type="number" min={5} max={1440} step={5} className="w-28" value={fixedDurationMinutes} onChange={(event) => setFixedDurationMinutes(Number(event.target.value))} /></div>{durationMode === "fixed_multiple" ? <p className="mt-3 text-xs text-muted">O cliente poderá selecionar múltiplos blocos consecutivos desta duração.</p> : null}</div> : null}
    </Card>
    <div className="flex flex-wrap items-center justify-between gap-3"><SaveNotice result={result} /><Button disabled={pending} onClick={() => startTransition(async () => setResult(await saveSchedule({ groups, durationMode, fixedDurationMinutes })))}>{pending ? "Salvando..." : "Salvar configuração"}</Button></div>
  </div></>;
}
