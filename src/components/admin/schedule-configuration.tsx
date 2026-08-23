"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { saveSchedule } from "@/app/admin/actions";
import { PageHeader } from "@/components/ui/page-header";
import { SaveNotice } from "@/components/admin/save-notice";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { classes } from "@/lib/classes";
import type { ActionResult, BusinessForm, BusinessGroupForm } from "@/types/business";
import type { DurationMode } from "@/types/database";

const modes: { id: DurationMode; title: string; description: string }[] = [
  { id: "fixed", title: "Duração fixa", description: "Um bloco com a mesma duração para todos." },
  { id: "fixed_multiple", title: "Duração fixa + múltiplos blocos", description: "O cliente escolhe um ou mais blocos consecutivos." },
  { id: "group_2", title: "Duração pelo Grupo 2", description: "Cada opção do Grupo 2 define a sua duração." },
];

export function ScheduleConfiguration({ initialBusiness }: { initialBusiness: BusinessForm }) {
  const [groups, setGroups] = useState(initialBusiness.groups);
  const [durationMode, setDurationMode] = useState(initialBusiness.durationMode);
  const [fixedDurationMinutes, setFixedDurationMinutes] = useState(initialBusiness.fixedDurationMinutes);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const setGroup = (index: 0 | 1, patch: Partial<BusinessGroupForm>) => setGroups((current) => current.map((group, groupIndex) => groupIndex === index ? { ...group, ...patch } : group) as typeof current);
  const moveOption = (groupIndex: 0 | 1, optionIndex: number, direction: -1 | 1) => {
    const options = [...groups[groupIndex].options];
    const target = optionIndex + direction;
    if (target < 0 || target >= options.length) return;
    [options[optionIndex], options[target]] = [options[target], options[optionIndex]];
    setGroup(groupIndex, { options });
  };

  return <><PageHeader title="Configuração da agenda" description="Defina os grupos exibidos e como a duração é calculada." /><div className="mt-6 space-y-6">
    {groups.map((group, index) => { const groupIndex = index as 0 | 1; const showDuration = group.position === 2 && durationMode === "group_2"; return <Card as="section" padding="md" key={group.position}><div className="grid grid-cols-[1fr_auto] items-center gap-4"><div className="space-y-2"><Label htmlFor={`group-${group.position}-name`}>Nome do Grupo {group.position}</Label><Input id={`group-${group.position}-name`} value={group.label} onChange={(event) => setGroup(groupIndex, { label: event.target.value })} /></div><div className="flex flex-col items-center gap-1"><Switch checked={group.active} onChange={(active) => setGroup(groupIndex, { active })} label={`Ativar Grupo ${group.position}`} /><span className="text-[11px] text-muted">{group.active ? "Ativo" : "Inativo"}</span></div></div><div className={classes("mt-4 space-y-2", !group.active && "opacity-45")}>{group.options.map((option, optionIndex) => <div key={option.id ?? `new-${optionIndex}`} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center"><Input value={option.name} onChange={(event) => setGroup(groupIndex, { options: group.options.map((item, itemIndex) => itemIndex === optionIndex ? { ...item, name: event.target.value } : item) })} /><div className="flex items-center justify-end gap-1">{showDuration ? <><Input aria-label={`Duração de ${option.name}`} type="number" min={5} max={1440} step={5} className="max-w-24" value={option.durationMinutes ?? 30} onChange={(event) => setGroup(groupIndex, { options: group.options.map((item, itemIndex) => itemIndex === optionIndex ? { ...item, durationMinutes: Number(event.target.value) } : item) })} /><span className="text-xs text-muted">min</span></> : null}<Button variant="ghost" size="icon" aria-label="Mover opção para cima" disabled={optionIndex === 0} onClick={() => moveOption(groupIndex, optionIndex, -1)}><ArrowUp className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label="Mover opção para baixo" disabled={optionIndex === group.options.length - 1} onClick={() => moveOption(groupIndex, optionIndex, 1)}><ArrowDown className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label="Remover opção" onClick={() => setGroup(groupIndex, { options: group.options.filter((_, itemIndex) => itemIndex !== optionIndex) })}><Trash2 className="h-4 w-4" /></Button></div></div>)}<Button variant="outline" size="sm" onClick={() => setGroup(groupIndex, { options: [...group.options, { name: "Nova opção", durationMinutes: 30 }] })}><Plus className="h-4 w-4" />Adicionar opção</Button></div></Card>; })}
    <Card as="section" padding="md"><h2 className="text-sm font-semibold">Modo de duração</h2><p className="mt-1 text-xs text-muted">Existem somente os três modos abaixo.</p><div className="mt-4 grid gap-3 md:grid-cols-3">{modes.map((mode) => <button key={mode.id} type="button" onClick={() => setDurationMode(mode.id)} className={classes("focus-ring rounded-xl border p-4 text-left", durationMode === mode.id && "border-primary bg-primary/5")}><span className="text-sm font-semibold">{mode.id === "group_2" ? `Duração pelo ${groups[1].label}` : mode.title}</span><span className="mt-1 block text-xs text-muted">{mode.description}</span></button>)}</div>
      {durationMode !== "group_2" ? <div className="mt-5 border-t pt-4"><Label>Duração do bloco</Label><div className="mt-2 flex flex-wrap gap-2">{[30, 45, 60].map((minutes) => <button key={minutes} type="button" onClick={() => setFixedDurationMinutes(minutes)} className={classes("focus-ring rounded-lg border px-4 py-2 text-sm font-medium", fixedDurationMinutes === minutes && "border-primary bg-primary text-white")}>{minutes} min</button>)}<Input aria-label="Duração personalizada" type="number" min={5} max={1440} step={5} className="w-28" value={fixedDurationMinutes} onChange={(event) => setFixedDurationMinutes(Number(event.target.value))} /></div>{durationMode === "fixed_multiple" ? <p className="mt-3 text-xs text-muted">O cliente poderá selecionar múltiplos blocos consecutivos desta duração.</p> : null}</div> : null}
    </Card>
    <div className="flex flex-wrap items-center justify-between gap-3"><SaveNotice result={result} /><Button disabled={pending} onClick={() => startTransition(async () => setResult(await saveSchedule({ groups, durationMode, fixedDurationMinutes })))}>{pending ? "Salvando..." : "Salvar configuração"}</Button></div>
  </div></>;
}
