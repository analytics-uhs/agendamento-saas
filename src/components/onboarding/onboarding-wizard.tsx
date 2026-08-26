"use client";

import { ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, Copy, ImageUp, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { completeOnboarding } from "@/app/onboarding/actions";
import { Button } from "@/components/ui/button";
import { BusinessHourDay } from "@/components/business-hour-day";
import { Input, Label } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Logo } from "@/components/ui/logo";
import { ThemePreferenceToggle } from "@/components/theme/theme-preference-toggle";
import { classes } from "@/lib/classes";
import { bookingGroupPosition, bookingGroupProductName } from "@/lib/booking-groups";
import { cloneBusinessHourWindows, createEmptyBusinessForm, normalizeSlug, validateBusinessForm, validateBusinessHours, validateDuration, validateSlug } from "@/lib/business-form";
import { uploadBusinessLogo, validateLogoFile } from "@/lib/logo-upload";
import { palettes } from "@/lib/palettes";
import { publicDomain } from "@/lib/public-url";
import type { BusinessForm, BusinessGroupForm } from "@/types/business";

const steps = ["Negócio", "Agenda", "Horários", "Aparência", "Pronto"];

export function OnboardingWizard() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<BusinessForm>(createEmptyBusinessForm());
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [step, setStep] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const setGroup = (index: 0 | 1, patch: Partial<BusinessGroupForm>) => setForm((current) => ({ ...current, groups: current.groups.map((group, groupIndex) => groupIndex === index ? { ...group, ...patch } : group) as typeof current.groups }));
  const moveOption = (groupIndex: 0 | 1, optionIndex: number, direction: -1 | 1) => {
    const options = [...form.groups[groupIndex].options];
    const target = optionIndex + direction;
    if (target < 0 || target >= options.length) return;
    [options[optionIndex], options[target]] = [options[target], options[optionIndex]];
    setGroup(groupIndex, { options });
  };
  const monday = form.hours.find((hour) => hour.weekday === 1);

  const next = () => {
    setMessage(null);
    if (step === 0) {
      if (form.name.trim().length < 2) return setMessage("Informe o nome do negócio.");
      const error = validateSlug(form.slug);
      if (error) return setMessage(error);
    }
    if (step === 1) {
      const groupError = form.groups.find((group) => !group.label.trim() || (group.active && group.options.length === 0) || group.options.some((option) => !option.name.trim()));
      if (groupError) return setMessage(`Revise o ${bookingGroupProductName(groupError.position)}.`);
      const error = validateDuration(form.durationMode, form.fixedDurationMinutes, form.groups[1].options.map((option) => option.durationMinutes));
      if (error) return setMessage(error);
    }
    if (step === 2) {
      const error = validateBusinessHours(form.hours);
      if (error) return setMessage(error);
    }
    if (step < 3) return setStep(step + 1);

    const error = validateBusinessForm(form);
    if (error) return setMessage(error);
    startTransition(async () => {
      const result = await completeOnboarding(form);
      if (!result.ok || !result.data) return setMessage(result.message);
      if (logoFile) {
        const upload = await uploadBusinessLogo(result.data.businessId, logoFile);
        if (!upload.ok) setMessage(`Negócio criado. ${upload.message} Você poderá enviar o logo no painel.`);
      }
      setForm((current) => ({ ...current, id: result.data!.businessId, slug: result.data!.slug }));
      setStep(4);
    });
  };

  return <main className="min-h-screen bg-surface px-4 py-8"><div className="mx-auto w-full max-w-xl">
    <header className="mb-6"><p className="text-sm font-medium text-primary">Passo {step + 1} de {steps.length}</p><h1 className="mt-1 text-2xl font-semibold">{steps[step]}</h1><div className="mt-4 flex gap-1.5">{steps.map((label, index) => <span key={label} className={classes("h-1.5 flex-1 rounded-full", index <= step ? "bg-primary" : "bg-border")} />)}</div></header>
    <div className="rounded-2xl border bg-background p-5 sm:p-6">
      {step === 0 ? <div className="space-y-5"><div className="flex items-center gap-3"><Logo name={form.name || "Negócio"} size="lg" /><div><p className="text-sm font-medium">Logo do negócio</p><p className="text-xs text-muted">PNG, JPEG ou WebP, até 2 MB.</p><input ref={fileRef} className="hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0] ?? null; const error = file ? validateLogoFile(file) : null; setMessage(error); setLogoFile(error ? null : file); }} /><Button variant="outline" size="sm" className="mt-2" onClick={() => fileRef.current?.click()}><ImageUp className="h-4 w-4" />{logoFile ? logoFile.name : "Escolher imagem"}</Button></div></div><div className="space-y-2"><Label htmlFor="business-name">Nome do negócio</Label><Input id="business-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value, slug: normalizeSlug(event.target.value) })} /></div><div className="space-y-2"><Label htmlFor="business-whatsapp">WhatsApp</Label><Input id="business-whatsapp" value={form.whatsapp} onChange={(event) => setForm({ ...form, whatsapp: event.target.value })} /></div><div className="space-y-2"><Label>Endereço público</Label><div className="overflow-hidden rounded-xl border bg-card px-3 py-3 text-sm"><span className="text-muted">{publicDomain}/</span><span className="font-medium">{form.slug || "nome-do-negocio"}</span></div><p className="text-xs text-muted">Gerado automaticamente a partir do nome. Se já existir, adicionaremos um número.</p></div><div className="space-y-2"><Label htmlFor="business-address">Endereço físico <span className="font-normal text-muted">(opcional)</span></Label><Input id="business-address" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder="Rua, número, bairro e cidade" /></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="google-maps">Google Maps <span className="font-normal text-muted">(opcional)</span></Label><Input id="google-maps" inputMode="url" value={form.googleMapsUrl} onChange={(event) => setForm({ ...form, googleMapsUrl: event.target.value })} placeholder="maps.google.com/..." /></div><div className="space-y-2"><Label htmlFor="instagram">Instagram <span className="font-normal text-muted">(opcional)</span></Label><Input id="instagram" inputMode="url" value={form.instagramUrl} onChange={(event) => setForm({ ...form, instagramUrl: event.target.value })} placeholder="instagram.com/..." /></div><div className="space-y-2"><Label htmlFor="facebook">Facebook <span className="font-normal text-muted">(opcional)</span></Label><Input id="facebook" inputMode="url" value={form.facebookUrl} onChange={(event) => setForm({ ...form, facebookUrl: event.target.value })} placeholder="facebook.com/..." /></div></div></div> : null}
      {step === 1 ? <div className="space-y-5">{form.groups.map((group, index) => { const groupIndex = index as 0 | 1; const groupName = bookingGroupProductName(group.position); const showDuration = group.position === bookingGroupPosition("secondary") && form.durationMode === "group_2"; return <section key={group.position} className="rounded-xl border p-4"><div className="grid grid-cols-[1fr_auto] items-center gap-3"><div className="space-y-1"><Label htmlFor={`group-${group.position}-label`}>Nome do {groupName}</Label><Input id={`group-${group.position}-label`} value={group.label} onChange={(event) => setGroup(groupIndex, { label: event.target.value })} /></div><Switch checked={group.active} onChange={(active) => setGroup(groupIndex, { active })} label={`Ativar ${groupName}`} /></div><div className={classes("mt-3 space-y-2", !group.active && "opacity-45")}>{group.options.map((option, optionIndex) => <div key={optionIndex} className="flex gap-2"><Input value={option.name} onChange={(event) => setGroup(groupIndex, { options: group.options.map((item, itemIndex) => itemIndex === optionIndex ? { ...item, name: event.target.value } : item) })} />{showDuration ? <Input aria-label="Duração em minutos" type="number" min={5} max={1440} step={5} className="w-24" value={option.durationMinutes ?? 30} onChange={(event) => setGroup(groupIndex, { options: group.options.map((item, itemIndex) => itemIndex === optionIndex ? { ...item, durationMinutes: Number(event.target.value) } : item) })} /> : null}<Button variant="ghost" size="icon" aria-label="Mover opção para cima" disabled={optionIndex === 0} onClick={() => moveOption(groupIndex, optionIndex, -1)}><ArrowUp className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label="Mover opção para baixo" disabled={optionIndex === group.options.length - 1} onClick={() => moveOption(groupIndex, optionIndex, 1)}><ArrowDown className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label="Remover opção" onClick={() => setGroup(groupIndex, { options: group.options.filter((_, itemIndex) => itemIndex !== optionIndex) })}><Trash2 className="h-4 w-4" /></Button></div>)}<Button variant="outline" size="sm" onClick={() => setGroup(groupIndex, { options: [...group.options, { name: "Nova opção", durationMinutes: 30 }] })}><Plus className="h-4 w-4" />Adicionar opção</Button></div></section>; })}<div className="rounded-xl border p-4"><p className="text-sm font-semibold">Modo de duração</p><div className="mt-3 grid gap-2">{[{ id: "fixed" as const, label: "Duração fixa" }, { id: "fixed_multiple" as const, label: "Duração fixa + múltiplos blocos" }, { id: "group_2" as const, label: `Duração pelo ${form.groups[1].label}` }].map((mode) => <button key={mode.id} type="button" onClick={() => setForm({ ...form, durationMode: mode.id })} className={classes("focus-ring rounded-xl border p-3 text-left text-sm font-medium", form.durationMode === mode.id && "border-primary bg-primary/5 text-primary")}>{mode.label}</button>)}</div>{form.durationMode !== "group_2" ? <div className="mt-4 space-y-2"><Label htmlFor="fixed-duration">Duração do bloco</Label><Input id="fixed-duration" type="number" min={5} max={1440} step={5} value={form.fixedDurationMinutes} onChange={(event) => setForm({ ...form, fixedDurationMinutes: Number(event.target.value) })} /></div> : null}</div></div> : null}
      {step === 2 ? <div className="space-y-3"><div className="flex justify-end"><Button variant="outline" size="sm" disabled={!monday} onClick={() => monday && setForm({ ...form, hours: form.hours.map((hour) => hour.weekday === 1 ? hour : { ...hour, active: monday.active, windows: cloneBusinessHourWindows(monday.windows) }) })}><Copy className="h-4 w-4" />Copiar segunda</Button></div>{form.hours.map((hour) => <BusinessHourDay key={hour.weekday} compact hour={hour} onChange={(updated) => setForm({ ...form, hours: form.hours.map((item) => item.weekday === updated.weekday ? updated : item) })} />)}</div> : null}
      {step === 3 ? <div className="space-y-5"><div className="grid grid-cols-2 gap-3">{palettes.map((palette) => <button key={palette.id} type="button" onClick={() => setForm({ ...form, paletteId: palette.id })} className={classes("focus-ring rounded-xl border p-3 text-left", form.paletteId === palette.id && "border-primary bg-primary/5")}><div className="flex gap-1.5">{[palette.primary, palette.accent, palette.surface, palette.text].map((color) => <span key={color} className="h-6 w-6 rounded-full border" style={{ background: color }} />)}</div><p className="mt-2 text-sm font-medium">{palette.name}</p></button>)}</div><div className="flex items-center justify-between rounded-xl border p-3"><div><Label>Tema da página</Label><p className="text-xs text-muted">Alterne pelo ícone.</p></div><ThemePreferenceToggle value={form.themePreference} onChange={(themePreference) => setForm({ ...form, themePreference })} /></div></div> : null}
      {step === 4 ? <div className="py-6 text-center"><span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary text-white"><Check className="h-7 w-7" /></span><h2 className="mt-4 text-xl font-semibold">Tudo pronto!</h2><p className="mt-1 text-sm text-muted">Sua página está disponível em <strong className="text-foreground">{publicDomain}/{form.slug}</strong></p>{message ? <p className="mt-3 text-sm text-muted">{message}</p> : null}<Button className="mt-6 w-full" onClick={() => { router.replace("/admin"); router.refresh(); }}>Ir para o painel</Button></div> : null}
      {message && step < 4 ? <p role="alert" className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{message}</p> : null}
    </div>
    {step < 4 ? <div className="mt-5 flex justify-between gap-3"><Button variant="ghost" disabled={pending} onClick={() => step === 0 ? router.push("/") : setStep(step - 1)}><ChevronLeft className="h-4 w-4" />Voltar</Button><Button disabled={pending} onClick={next}>{pending ? "Salvando..." : step === 3 ? "Concluir" : "Continuar"}{!pending && <ChevronRight className="h-4 w-4" />}</Button></div> : null}
  </div></main>;
}
