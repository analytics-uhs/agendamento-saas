"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMockApp } from "@/components/mock-app-provider";
import { PageHeading } from "@/components/admin/page-heading";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { classes } from "@/lib/classes";
import type { DurationMode, GroupConfig } from "@/types/scheduling";

const modes: { id: DurationMode; title: string; description: string }[] = [
  { id: "fixed", title: "Duração fixa", description: "Um bloco com a mesma duração para todos." },
  { id: "fixed-multiple", title: "Duração fixa + múltiplos blocos", description: "O cliente escolhe um ou mais blocos consecutivos." },
  { id: "group2", title: "Duração pelo Grupo 2", description: "Cada opção do Grupo 2 define a sua duração." },
];

export function ScheduleConfiguration() {
  const { state, update } = useMockApp();
  const setGroup = (key: "group1" | "group2", patch: Partial<GroupConfig>) => update({ [key]: { ...state[key], ...patch } });
  return <><PageHeading title="Configuração da agenda" description="Defina os grupos exibidos e como a duração é calculada." /><div className="mt-6 space-y-6">
    {(["group1", "group2"] as const).map((key, index) => { const group = state[key], showDuration = key === "group2" && state.duration.mode === "group2"; return <section key={key} className="rounded-xl border bg-background p-4 sm:p-5"><div className="grid grid-cols-[1fr_auto] items-center gap-4"><div className="space-y-2"><Label htmlFor={`${key}-name`}>Nome do Grupo {index + 1}</Label><Input id={`${key}-name`} value={group.label} onChange={(event) => setGroup(key, { label: event.target.value })} /></div><div className="flex flex-col items-center gap-1"><Switch checked={group.enabled} onChange={(enabled) => setGroup(key, { enabled })} label={`Ativar Grupo ${index + 1}`} /><span className="text-[11px] text-muted">{group.enabled ? "Ativo" : "Inativo"}</span></div></div><div className={classes("mt-4 space-y-2", !group.enabled && "opacity-45")}>{group.options.map((option) => <div key={option.id} className="grid grid-cols-[1fr_auto] items-center gap-2"><Input value={option.name} onChange={(event) => setGroup(key, { options: group.options.map((item) => item.id === option.id ? { ...item, name: event.target.value } : item) })} /><div className="flex items-center gap-2">{showDuration ? <><Input aria-label={`Duração de ${option.name}`} type="number" min={5} step={5} className="max-w-20" value={option.durationMinutes ?? 30} onChange={(event) => setGroup(key, { options: group.options.map((item) => item.id === option.id ? { ...item, durationMinutes: Number(event.target.value) } : item) })} /><span className="text-xs text-muted">min</span></> : null}<Button variant="ghost" size="icon" aria-label="Remover opção" onClick={() => setGroup(key, { options: group.options.filter((item) => item.id !== option.id) })}><Trash2 className="h-4 w-4" /></Button></div></div>)}<Button variant="outline" size="sm" onClick={() => setGroup(key, { options: [...group.options, { id: `${key}-${Date.now()}`, name: "Nova opção", durationMinutes: 30 }] })}><Plus className="h-4 w-4" />Adicionar opção</Button></div></section>; })}
    <section className="rounded-xl border bg-background p-4 sm:p-5"><h2 className="text-sm font-semibold">Modo de duração</h2><p className="mt-1 text-xs text-muted">Existem somente os três modos abaixo.</p><div className="mt-4 grid gap-3 md:grid-cols-3">{modes.map((mode) => <button key={mode.id} type="button" onClick={() => update({ duration: { ...state.duration, mode: mode.id } })} className={classes("focus-ring rounded-xl border p-4 text-left", state.duration.mode === mode.id && "border-primary bg-primary/5")}><span className="text-sm font-semibold">{mode.id === "group2" ? `Duração pelo ${state.group2.label}` : mode.title}</span><span className="mt-1 block text-xs text-muted">{mode.description}</span></button>)}</div>
      {state.duration.mode !== "group2" ? <div className="mt-5 border-t pt-4"><Label>Duração do bloco</Label><div className="mt-2 flex flex-wrap gap-2">{[30, 45, 60].map((minutes) => <button key={minutes} type="button" onClick={() => update({ duration: { ...state.duration, fixedMinutes: minutes } })} className={classes("focus-ring rounded-lg border px-4 py-2 text-sm font-medium", state.duration.fixedMinutes === minutes && "border-primary bg-primary text-white")}>{minutes} min</button>)}</div>{state.duration.mode === "fixed-multiple" ? <div className="mt-4 max-w-xs space-y-2"><Label htmlFor="max-blocks">Máximo de blocos</Label><Input id="max-blocks" type="number" min={2} max={8} value={state.duration.maxBlocks} onChange={(event) => update({ duration: { ...state.duration, maxBlocks: Number(event.target.value) } })} /></div> : null}</div> : null}
    </section>
  </div></>;
}
