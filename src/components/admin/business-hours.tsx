"use client";

import { Copy } from "lucide-react";
import { useMockApp } from "@/components/mock-app-provider";
import { PageHeading } from "@/components/admin/page-heading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";

export function BusinessHours() {
  const { state, update } = useMockApp();
  const first = state.hours[0];
  return <><PageHeading title="Horários" description="Defina quando novos horários podem ser reservados." /><section className="mt-6 overflow-hidden rounded-xl border bg-background"><div className="flex items-center justify-between gap-3 border-b p-4"><div><h2 className="text-sm font-semibold">Horários de funcionamento</h2><p className="text-xs text-muted">A disponibilidade pública respeita estes períodos.</p></div><Button variant="outline" size="sm" disabled={!first} onClick={() => first && update({ hours: state.hours.map((item) => ({ ...item, enabled: item.day === "sun" ? item.enabled : true, start: first.start, end: first.end })) })}><Copy className="h-4 w-4" />Copiar segunda</Button></div><div className="divide-y">{state.hours.map((hour) => <div key={hour.day} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center"><div className="flex items-center gap-3"><Switch checked={hour.enabled} onChange={(enabled) => update({ hours: state.hours.map((item) => item.day === hour.day ? { ...item, enabled } : item) })} label={`Ativar ${hour.label}`} /><div><p className="text-sm font-medium">{hour.label}</p><p className="text-xs text-muted">{hour.enabled ? "Aberto" : "Fechado"}</p></div></div><div className="grid grid-cols-2 gap-2"><Input aria-label={`Início de ${hour.label}`} type="time" disabled={!hour.enabled} value={hour.start} onChange={(event) => update({ hours: state.hours.map((item) => item.day === hour.day ? { ...item, start: event.target.value } : item) })} /><Input aria-label={`Fim de ${hour.label}`} type="time" disabled={!hour.enabled} value={hour.end} onChange={(event) => update({ hours: state.hours.map((item) => item.day === hour.day ? { ...item, end: event.target.value } : item) })} /></div></div>)}</div></section></>;
}
