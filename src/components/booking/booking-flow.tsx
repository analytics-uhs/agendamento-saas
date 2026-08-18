"use client";

import { CheckCircle2, Clock3, MessageCircle } from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useMockApp } from "@/components/mock-app-provider";
import { DateStrip } from "@/components/booking/date-strip";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { Logo } from "@/components/ui/logo";
import { classes } from "@/lib/classes";
import { businessHourFor, formatDuration, formatLongDate, todayISO } from "@/lib/date";
import { availableSlots } from "@/lib/slots";
import { palettes } from "@/mocks/app";

function Section({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return <section className="step-in mt-7"><h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-[11px] font-bold text-white">{number}</span>{title}</h2>{children}</section>;
}

export function BookingFlow({ preview = false }: { preview?: boolean }) {
  const router = useRouter();
  const { state } = useMockApp();
  const [group1, setGroup1] = useState<string | null>(null), [group2, setGroup2] = useState<string | null>(null);
  const [windowStart, setWindowStart] = useState(todayISO()), [date, setDate] = useState<string | null>(null), [time, setTime] = useState<string | null>(null);
  const [blocks, setBlocks] = useState(1), [customer, setCustomer] = useState(""), [whatsapp, setWhatsapp] = useState("");
  const palette = palettes.find((item) => item.id === state.paletteId) ?? palettes[0];
  const style = { "--primary": palette.primary, "--accent": palette.accent, "--background": palette.background, "--surface": palette.surface, "--foreground": palette.text, "--muted": palette.muted, "--border": palette.border, "--card": palette.background } as CSSProperties;
  const group1Done = !state.group1.enabled || Boolean(group1), group2Done = group1Done && (!state.group2.enabled || Boolean(group2));
  const duration = useMemo(() => state.duration.mode === "group2" ? state.group2.options.find((item) => item.name === group2)?.durationMinutes ?? 30 : state.duration.fixedMinutes * (state.duration.mode === "fixed-multiple" ? blocks : 1), [state.duration, state.group2.options, group2, blocks]);
  const slots = date ? availableSlots(state, date) : [];
  const canConfirm = Boolean(date && time && customer.trim() && whatsapp.trim() && group1Done && group2Done);
  let step = 0;
  return <div style={style} className="min-h-screen bg-surface text-foreground"><div className={classes("mx-auto w-full max-w-md px-4 pb-16 pt-8", preview && "scale-[0.98]")}>
    <header className="flex flex-col items-center text-center"><Logo name={state.business.name} size="lg" /><h1 className="mt-3 text-xl font-semibold">{state.business.name}</h1><p className="mt-1 flex items-center gap-1.5 text-xs text-muted"><MessageCircle className="h-3.5 w-3.5" />{state.business.whatsapp}</p></header>
    {state.group1.enabled ? <Section number={++step} title={state.group1.label}><div className="space-y-2">{state.group1.options.map((option) => <button key={option.id} type="button" onClick={() => { setGroup1(option.name); setTime(null); }} className={classes("focus-ring flex w-full items-center gap-3 rounded-xl border bg-card p-4 text-left", group1 === option.name && "border-primary bg-primary/5")}><span className="flex-1 truncate text-sm font-medium">{option.name}</span>{group1 === option.name ? <CheckCircle2 className="h-5 w-5 text-primary" /> : null}</button>)}</div></Section> : null}
    {state.group2.enabled && group1Done ? <Section number={++step} title={state.group2.label}><div className="space-y-2">{state.group2.options.map((option) => <button key={option.id} type="button" onClick={() => { setGroup2(option.name); setTime(null); }} className={classes("focus-ring flex w-full items-center gap-3 rounded-xl border bg-card p-4 text-left", group2 === option.name && "border-primary bg-primary/5")}><span className="flex-1 truncate text-sm font-medium">{option.name}</span>{state.duration.mode === "group2" ? <span className="text-xs text-muted">{formatDuration(option.durationMinutes ?? 30)}</span> : null}{group2 === option.name ? <CheckCircle2 className="h-5 w-5 text-primary" /> : null}</button>)}</div></Section> : null}
    {group2Done ? <Section number={++step} title="Data"><DateStrip windowStart={windowStart} onWindowStartChange={(value) => { setWindowStart(value); setDate(null); setTime(null); }} selected={date} onSelect={(value) => { setDate(value); setTime(null); }} isUnavailable={(value) => !businessHourFor(state.hours, value)?.enabled} /></Section> : null}
    {date ? <Section number={++step} title="Horário"><div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{slots.map((slot) => <button key={slot} type="button" onClick={() => setTime(slot)} className={classes("focus-ring rounded-xl border bg-card py-3 text-sm font-semibold", time === slot && "border-primary bg-primary text-white")}>{slot}</button>)}</div>{slots.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted">Nenhum horário disponível nesta data.</p> : null}
      {time && state.duration.mode === "fixed-multiple" ? <div className="mt-4"><p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted"><Clock3 className="h-3.5 w-3.5" />Duração a partir de {time}</p><div className="flex flex-wrap gap-2">{Array.from({ length: state.duration.maxBlocks }, (_, index) => index + 1).map((count) => <button key={count} type="button" onClick={() => setBlocks(count)} className={classes("focus-ring rounded-xl border bg-card px-4 py-2.5 text-sm font-semibold", blocks === count && "border-primary bg-primary text-white")}>{formatDuration(state.duration.fixedMinutes * count)}</button>)}</div></div> : null}
    </Section> : null}
    {time ? <Section number={++step} title="Seus dados"><div className="space-y-3"><div className="space-y-2"><Label htmlFor="customer">Nome</Label><Input id="customer" value={customer} onChange={(event) => setCustomer(event.target.value)} placeholder="Seu nome" /></div><div className="space-y-2"><Label htmlFor="whatsapp">WhatsApp</Label><Input id="whatsapp" value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} placeholder="(00) 00000-0000" /></div></div></Section> : null}
    {time && date ? <><div className="step-in mt-6 rounded-xl border bg-card p-4 text-sm"><p className="text-muted">Resumo</p><p className="mt-1 font-medium">{[group1, group2].filter(Boolean).join(" · ")}</p><p className="capitalize text-muted">{formatLongDate(date)} · {time} · {formatDuration(duration)}</p></div><Button className="mt-4 h-12 w-full text-base" disabled={!canConfirm} onClick={() => { const params = new URLSearchParams({ date, time, duration: String(duration), customer, group1: group1 ?? "", group2: group2 ?? "" }); router.push(`/agendar/${state.business.slug}/confirmacao?${params}`); }}>Confirmar agendamento</Button></> : null}
    {preview ? <p className="mt-4 text-center text-xs text-muted">Pré-visualização da página pública</p> : null}
  </div></div>;
}
