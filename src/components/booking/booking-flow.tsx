"use client";

import { CalendarDays, Check, Clock3, Info, LoaderCircle, MapPin, Pencil, UserRound } from "lucide-react";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPublicBooking, getAvailability } from "@/app/agendar/[slug]/actions";
import { DateStrip } from "@/components/booking/date-strip";
import { useMockApp } from "@/components/mock-app-provider";
import { BusinessLogo } from "@/components/ui/business-logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label } from "@/components/ui/field";
import { FacebookIcon, InstagramIcon, WhatsappIcon } from "@/components/ui/social-icons";
import { appearanceStyle } from "@/lib/appearance";
import { formatWhatsappInput, normalizeWhatsapp } from "@/lib/availability";
import { classes } from "@/lib/classes";
import { formatDuration, formatLongDate, parseISO, todayISO } from "@/lib/date";
import { consecutiveSelectionTimes, fixedMultipleEndTime, selectFixedMultipleSlot } from "@/lib/fixed-multiple-selection";
import { getPalette } from "@/lib/palettes";
import { bookingCtaHelper, publicBookingSteps, type PublicBookingStepId } from "@/lib/public-booking-flow";
import type { VisualThemePreference } from "@/types/business";
import type { BookingConfirmation, BookingSlot, PublicBookingData } from "@/types/public-booking";
import type { MockAppState } from "@/types/scheduling";

function StepHeading({ number, title, description }: { number: number; title: string; description?: string }) {
  return <div className="flex items-start gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary text-xs font-bold text-white">{number}</span><div><h2 className="text-base font-semibold sm:text-lg">{title}</h2>{description ? <p className="mt-0.5 text-xs leading-relaxed text-muted sm:text-sm">{description}</p> : null}</div></div>;
}

function ExpandedStep({ number, title, description, children }: { number: number; title: string; description?: string; children: React.ReactNode }) {
  return <Card as="section" padding="md" className="step-in bg-card"><StepHeading number={number} title={title} description={description} /><div className="mt-4">{children}</div></Card>;
}

function CompletedStep({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return <Card as="section" padding="sm" className="flex items-center gap-3 bg-card"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Check className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="truncate text-[11px] text-muted">{label}</p><p title={value} className="truncate text-sm font-semibold">{value}</p></div><button type="button" aria-label={`Alterar ${label}`} onClick={onEdit} className="focus-ring inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-primary hover:bg-primary/5"><Pencil className="h-3.5 w-3.5" />Alterar</button></Card>;
}

function FlowProgress({ steps, activeStep }: { steps: ReturnType<typeof publicBookingSteps>; activeStep: PublicBookingStepId }) {
  const activeIndex = Math.max(0, steps.findIndex((step) => step.id === activeStep));
  return <div className="rounded-xl border bg-card px-4 py-3" aria-label={`Etapa ${activeIndex + 1} de ${steps.length}: ${steps[activeIndex]?.label}`}><div className="flex items-center justify-between gap-3 text-[11px]"><p className="min-w-0 truncate font-semibold text-primary">Etapa {activeIndex + 1} de {steps.length} · {steps[activeIndex]?.label}</p><p className="max-w-[45%] shrink-0 truncate text-muted">{activeIndex === steps.length - 1 ? "Quase lá" : `Depois: ${steps[activeIndex + 1]?.label ?? "confirmação"}`}</p></div><div className="mt-2 flex gap-1.5" aria-hidden="true">{steps.map((step, index) => <span key={step.id} className={classes("h-0.5 flex-1 rounded-full bg-border", index < activeIndex && "bg-primary", index === activeIndex && "bg-accent")} />)}</div></div>;
}

function OptionButton({ selected, name, meta, onClick }: { selected: boolean; name: string; meta?: string; onClick: () => void }) {
  return <button type="button" aria-pressed={selected} onClick={onClick} className={classes("focus-ring flex min-h-12 w-full items-center gap-3 rounded-xl border bg-card px-3 py-3 text-left transition-colors hover:border-primary", selected && "border-primary bg-primary/10")}><span className={classes("grid h-7 w-7 shrink-0 place-items-center rounded-lg border bg-card text-transparent", selected && "border-primary bg-primary text-white")}><Check className="h-4 w-4" /></span><span className="min-w-0 flex-1 truncate text-sm font-semibold">{name}</span>{meta ? <span className="text-xs text-muted">{meta}</span> : null}{selected ? <span className="hidden text-xs font-medium text-primary sm:inline">Selecionado</span> : null}</button>;
}

function previewData(state: MockAppState, paletteId?: string, themePreference: VisualThemePreference = "light"): PublicBookingData {
  const dayToWeekday = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 } as const;
  return {
    business: { id: "preview", name: state.business.name, slug: state.business.slug, whatsapp: state.business.whatsapp, logoUrl: null, address: null, googleMapsUrl: null, instagramUrl: null, facebookUrl: null },
    groups: [...(state.group1.enabled ? [{ position: 1 as const, label: state.group1.label, required: true, options: state.group1.options.map((option) => ({ id: option.id, name: option.name, durationMinutes: null })) }] : []), ...(state.group2.enabled ? [{ position: 2 as const, label: state.group2.label, required: true, options: state.group2.options.map((option) => ({ id: option.id, name: option.name, durationMinutes: option.durationMinutes ?? null })) }] : [])],
    hours: state.hours.filter((hour) => hour.enabled).map((hour) => ({ weekday: dayToWeekday[hour.day], startTime: hour.start, endTime: hour.end })),
    settings: { durationMode: state.duration.mode === "fixed-multiple" ? "fixed_multiple" : state.duration.mode === "group2" ? "group_2" : "fixed", fixedDurationMinutes: state.duration.fixedMinutes, allowMultipleBlocks: state.duration.mode === "fixed-multiple", palette: getPalette(paletteId ?? state.paletteId), themePreference },
  };
}

export function BookingFlow({ booking: bookingProp, preview = false, paletteId, themePreference }: { booking?: PublicBookingData; preview?: boolean; paletteId?: string; themePreference?: VisualThemePreference }) {
  const router = useRouter();
  const { state } = useMockApp();
  const booking = bookingProp ?? previewData(state, paletteId, themePreference);
  const groupOne = booking.groups.find((group) => group.position === 1);
  const groupTwo = booking.groups.find((group) => group.position === 2);
  const steps = useMemo(() => publicBookingSteps(groupOne?.label, groupTwo?.label), [groupOne?.label, groupTwo?.label]);
  const [activeStep, setActiveStep] = useState<PublicBookingStepId>(steps[0]?.id ?? "date");
  const [group1, setGroup1] = useState<string | null>(null);
  const [group2, setGroup2] = useState<string | null>(null);
  const [windowStart, setWindowStart] = useState(todayISO());
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [slots, setSlots] = useState<BookingSlot[]>([]);
  const [blocks, setBlocks] = useState(1);
  const [customer, setCustomer] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [sequenceMessage, setSequenceMessage] = useState<string | null>(null);
  const availabilityRequest = useRef(0);
  const [isLoadingSlots, startSlotsTransition] = useTransition();
  const [isSubmitting, startSubmitTransition] = useTransition();
  const style = appearanceStyle(booking.settings.palette, booking.settings.themePreference);
  const group1Done = !groupOne || Boolean(group1);
  const group2Done = group1Done && (!groupTwo || Boolean(group2));
  const selectedGroupOne = groupOne?.options.find((option) => option.id === group1);
  const selectedGroupTwo = groupTwo?.options.find((option) => option.id === group2);
  const selectedSlot = slots.find((slot) => slot.startTime === time);
  const selectedTimes = booking.settings.durationMode === "fixed_multiple" ? consecutiveSelectionTimes(slots, time, blocks) : time ? [time] : [];
  const duration = useMemo(() => (selectedSlot?.durationMinutes ?? booking.settings.fixedDurationMinutes) * (booking.settings.durationMode === "fixed_multiple" ? blocks : 1), [selectedSlot, booking.settings, blocks]);
  const endTime = time && selectedSlot ? fixedMultipleEndTime(time, selectedSlot.durationMinutes, booking.settings.durationMode === "fixed_multiple" ? blocks : 1) : null;
  const canConfirm = Boolean(date && time && customer.trim().length >= 2 && whatsapp.trim() && group1Done && group2Done && !isSubmitting);
  const configurationInvalid = Boolean((groupOne && groupOne.options.length === 0) || (groupTwo && groupTwo.options.length === 0));
  const hasProgress = Boolean(group1 || group2 || date || time);
  const activeStepIndex = steps.findIndex((step) => step.id === activeStep);
  const ctaHelper = bookingCtaHelper({ groupOneMissing: !group1Done, groupTwoMissing: !group2Done, dateMissing: !date, timeMissing: !time, customerMissing: customer.trim().length < 2, whatsappMissing: !whatsapp.trim() });
  const numberOf = (id: PublicBookingStepId) => steps.findIndex((step) => step.id === id) + 1;

  function completedStepValue(id: PublicBookingStepId) {
    if (id === "group_1") return selectedGroupOne?.name ?? null;
    if (id === "group_2") return selectedGroupTwo?.name ?? null;
    if (id === "date") return date ? formatLongDate(date) : null;
    if (id === "time") return time ? `${time}${endTime ? `–${endTime}` : ""} · ${formatDuration(duration)}` : null;
    return null;
  }

  function nextAfter(id: PublicBookingStepId) { const index = steps.findIndex((step) => step.id === id); setActiveStep(steps[index + 1]?.id ?? "customer"); }
  function resetSchedule() { availabilityRequest.current += 1; setDate(null); setTime(null); setSlots([]); setBlocks(1); setMessage(null); setSequenceMessage(null); }
  function chooseGroupOne(optionId: string) { if (optionId !== group1) { setGroup1(optionId); setGroup2(null); resetSchedule(); } nextAfter("group_1"); }
  function chooseGroupTwo(optionId: string) { if (optionId !== group2) { setGroup2(optionId); resetSchedule(); } nextAfter("group_2"); }

  function loadSlots(selectedDate: string) {
    const request = ++availabilityRequest.current;
    setDate(selectedDate); setTime(null); setBlocks(1); setSlots([]); setMessage(null); setSequenceMessage(null); setActiveStep("time");
    if (preview) {
      const dayHours = booking.hours.filter((item) => item.weekday === parseISO(selectedDate).getDay());
      if (!dayHours.length) return;
      const base = booking.settings.durationMode === "group_2" ? groupTwo?.options.find((option) => option.id === group2)?.durationMinutes ?? 30 : booking.settings.fixedDurationMinutes;
      setSlots(dayHours.flatMap((hour) => { const [startHour = 0, startMinute = 0] = hour.startTime.split(":").map(Number); const [endHour = 0, endMinute = 0] = hour.endTime.split(":").map(Number); const start = startHour * 60 + startMinute; const end = endHour * 60 + endMinute; return Array.from({ length: Math.max(0, Math.floor((end - start) / base)) }, (_, index) => ({ startTime: `${String(Math.floor((start + index * base) / 60)).padStart(2, "0")}:${String((start + index * base) % 60).padStart(2, "0")}`, durationMinutes: base, maxBlocks: Math.min(3, Math.floor((end - start - index * base) / base)) })); }));
      return;
    }
    startSlotsTransition(async () => { const result = await getAvailability({ slug: booking.business.slug, date: selectedDate, group1OptionId: group1, group2OptionId: group2 }); if (request !== availabilityRequest.current) return; if (result.ok) setSlots(result.data); else setMessage(result.message); });
  }

  function chooseTime(slot: BookingSlot) {
    if (booking.settings.durationMode === "fixed_multiple") { const next = selectFixedMultipleSlot(slots, time, blocks, slot.startTime); setTime(next.startTime); setBlocks(next.blocks); setSequenceMessage(next.rejected ? "Este horário não pode ser combinado. Selecione horários consecutivos." : null); }
    else { setTime(slot.startTime); setBlocks(1); setActiveStep("customer"); }
    setMessage(null);
  }

  function confirm() {
    if (preview || !date || !time || !canConfirm) return;
    setMessage(null);
    startSubmitTransition(async () => {
      const result = await createPublicBooking({ slug: booking.business.slug, group1OptionId: group1, group2OptionId: group2, date, startTime: time, blocks, customerName: customer, customerWhatsapp: whatsapp });
      if (!result.ok) { if (result.staleSelection) { setGroup1(null); setGroup2(null); resetSchedule(); setActiveStep(steps[0]?.id ?? "date"); } if (result.conflict) loadSlots(date); setMessage(result.message); return; }
      sessionStorage.setItem(`booking-confirmation:${booking.business.slug}`, JSON.stringify({ ...result.data, business: { ...result.data.business, whatsapp: booking.business.whatsapp }, appearance: { palette: booking.settings.palette, themePreference: booking.settings.themePreference } } satisfies BookingConfirmation));
      router.push(`/agendar/${booking.business.slug}/confirmacao`);
    });
  }

  const summary = <div className="space-y-4"><div className="flex items-center gap-3"><BusinessLogo name={booking.business.name} logoUrl={booking.business.logoUrl} size="sm" /><div><p className="text-sm font-semibold">Seu agendamento</p><p className="text-xs text-muted">{booking.business.name}</p></div></div><dl className="space-y-3 text-sm">{selectedGroupOne ? <div className="flex justify-between gap-4"><dt className="text-muted">{groupOne?.label}</dt><dd className="text-right font-semibold">{selectedGroupOne.name}</dd></div> : null}{selectedGroupTwo ? <div className="flex justify-between gap-4"><dt className="text-muted">{groupTwo?.label}</dt><dd className="text-right font-semibold">{selectedGroupTwo.name}</dd></div> : null}{date ? <div className="flex justify-between gap-4"><dt className="flex items-center gap-1.5 text-muted"><CalendarDays className="h-3.5 w-3.5" />Data</dt><dd className="text-right font-semibold capitalize">{formatLongDate(date)}</dd></div> : null}{time ? <div className="flex justify-between gap-4"><dt className="flex items-center gap-1.5 text-muted"><Clock3 className="h-3.5 w-3.5" />Horário</dt><dd className="text-right font-semibold">{time}{endTime ? `–${endTime}` : ""}</dd></div> : null}{customer.trim() ? <div className="flex justify-between gap-4"><dt className="flex items-center gap-1.5 text-muted"><UserRound className="h-3.5 w-3.5" />Nome</dt><dd className="text-right font-semibold">{customer.trim()}</dd></div> : null}</dl>{time ? <div className="flex items-center justify-between border-t pt-3 text-sm"><span className="text-muted">Duração total</span><strong>{formatDuration(duration)}</strong></div> : null}</div>;
  const confirmationAction = <><Button className="h-12 w-full text-base" disabled={!canConfirm || preview} onClick={confirm}>{isSubmitting ? <><LoaderCircle className="h-4 w-4 animate-spin" />Confirmando...</> : "Confirmar agendamento"}</Button><p className="mt-2 flex items-start justify-center gap-1.5 text-center text-[11px] leading-relaxed text-muted"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />{ctaHelper}</p></>;

  return <div style={style} data-theme={booking.settings.themePreference} className="min-h-screen bg-surface text-foreground"><div className={classes("mx-auto w-full max-w-6xl px-4 pb-16 pt-5 sm:px-6 sm:pt-7", preview && "scale-[0.98]")}>
    <header className={classes("flex flex-col items-center text-center lg:flex-row lg:justify-between lg:text-left", hasProgress && "max-lg:flex-row max-lg:items-center max-lg:text-left")}><div className={classes("flex min-w-0 items-center gap-3", !hasProgress && "max-lg:flex-col")}><BusinessLogo name={booking.business.name} logoUrl={booking.business.logoUrl} size={hasProgress ? "md" : "lg"} /><div className="min-w-0"><h1 className={classes("font-semibold", hasProgress ? "truncate text-base" : "text-xl lg:text-2xl")}>{booking.business.name}</h1>{booking.business.address ? <p className={classes("mt-1.5 max-w-md items-start gap-1.5 text-xs leading-relaxed text-muted lg:flex", hasProgress ? "hidden lg:flex" : "flex justify-center lg:justify-start")}><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />{booking.business.address}</p> : hasProgress ? <p className="text-xs text-muted lg:hidden">Agendamento online</p> : null}</div></div><div className={classes("flex flex-wrap items-center justify-center gap-2 lg:justify-end", hasProgress ? "ml-auto" : "mt-3 lg:mt-0")}>{booking.business.whatsapp ? <a href={`https://wa.me/${normalizeWhatsapp(booking.business.whatsapp)}`} target="_blank" rel="noopener noreferrer" className={classes("focus-ring inline-flex items-center justify-center gap-2 rounded-xl border bg-card text-xs font-semibold transition-colors hover:border-primary hover:text-primary", hasProgress ? "h-10 w-10 lg:w-auto lg:px-3" : "min-h-10 px-3")} aria-label={`Falar com ${booking.business.name} pelo WhatsApp`}><WhatsappIcon className="h-4 w-4" /><span className={hasProgress ? "hidden lg:inline" : ""}>{formatWhatsappInput(booking.business.whatsapp)}</span></a> : null}{booking.business.googleMapsUrl ? <a href={booking.business.googleMapsUrl} target="_blank" rel="noopener noreferrer" className={classes("focus-ring h-10 w-10 items-center justify-center rounded-xl border bg-card text-muted hover:border-primary hover:text-primary lg:inline-flex", hasProgress ? "hidden" : "inline-flex")} aria-label="Abrir localização no Google Maps"><MapPin className="h-4 w-4" /></a> : null}{booking.business.instagramUrl ? <a href={booking.business.instagramUrl} target="_blank" rel="noopener noreferrer" className={classes("focus-ring h-10 w-10 items-center justify-center rounded-xl border bg-card text-muted hover:border-primary hover:text-primary lg:inline-flex", hasProgress ? "hidden" : "inline-flex")} aria-label="Abrir Instagram"><InstagramIcon className="h-4 w-4" /></a> : null}{booking.business.facebookUrl ? <a href={booking.business.facebookUrl} target="_blank" rel="noopener noreferrer" className={classes("focus-ring h-10 w-10 items-center justify-center rounded-xl border bg-card text-muted hover:border-primary hover:text-primary lg:inline-flex", hasProgress ? "hidden" : "inline-flex")} aria-label="Abrir Facebook"><FacebookIcon className="h-4 w-4" /></a> : null}</div></header>
    {!configurationInvalid ? <div className="mt-6"><FlowProgress steps={steps} activeStep={activeStep} /></div> : null}
    {configurationInvalid ? <EmptyState size="md" className="mt-7">O agendamento online ainda está sendo configurado. Tente novamente mais tarde.</EmptyState> : null}
    {!configurationInvalid ? <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]"><main className="space-y-3">
      {activeStepIndex > 0 ? <div className="grid gap-3 lg:grid-cols-3">{steps.slice(0, activeStepIndex).map((step) => { const value = completedStepValue(step.id); return value ? <CompletedStep key={step.id} label={step.label} value={value} onEdit={() => setActiveStep(step.id)} /> : null; })}</div> : null}
      {groupOne && activeStep === "group_1" ? <ExpandedStep number={numberOf("group_1")} title={groupOne.label} description="Selecione uma opção para continuar."><div className="space-y-2">{groupOne.options.map((option) => <OptionButton key={option.id} selected={group1 === option.id} name={option.name} onClick={() => chooseGroupOne(option.id)} />)}</div></ExpandedStep> : null}
      {groupTwo && group1Done && activeStep === "group_2" ? <ExpandedStep number={numberOf("group_2")} title={groupTwo.label} description="Selecione uma opção para continuar."><div className="space-y-2">{groupTwo.options.map((option) => <OptionButton key={option.id} selected={group2 === option.id} name={option.name} meta={booking.settings.durationMode === "group_2" ? formatDuration(option.durationMinutes ?? 0) : undefined} onClick={() => chooseGroupTwo(option.id)} />)}</div></ExpandedStep> : null}
      {group2Done && activeStep === "date" ? <ExpandedStep number={numberOf("date")} title="Escolha a data" description="Navegue em janelas de sete dias consecutivos."><DateStrip windowStart={windowStart} onWindowStartChange={(value) => { setWindowStart(value); resetSchedule(); setActiveStep("date"); }} selected={date} onSelect={loadSlots} isUnavailable={(value) => value < todayISO() || !booking.hours.some((hour) => hour.weekday === parseISO(value).getDay())} /></ExpandedStep> : null}
      {date && activeStep === "time" ? <ExpandedStep number={numberOf("time")} title="Escolha o horário" description={`${formatLongDate(date)} · ${booking.settings.durationMode === "fixed_multiple" ? `cada bloco reserva ${formatDuration(booking.settings.fixedDurationMinutes)}` : `duração de ${formatDuration(duration)}`}.`}>
        {booking.settings.durationMode === "fixed_multiple" ? <div className="mb-3 flex items-start gap-2 rounded-xl bg-primary/10 px-3 py-2.5 text-xs leading-relaxed"><Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>Para reservar mais tempo, selecione horários consecutivos.</span></div> : null}
        {isLoadingSlots ? <EmptyState size="md" className="flex items-center justify-center gap-2"><LoaderCircle className="h-4 w-4 animate-spin" />Consultando horários...</EmptyState> : <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-5">{slots.map((slot) => <button key={slot.startTime} type="button" aria-pressed={selectedTimes.includes(slot.startTime)} onClick={() => chooseTime(slot)} className={classes("focus-ring min-h-12 rounded-xl border bg-card px-2 py-3 text-sm font-semibold tabular-nums transition-colors hover:border-primary", selectedTimes.includes(slot.startTime) && "border-primary bg-primary text-white")}>{slot.startTime}</button>)}</div>}
        {!isLoadingSlots && slots.length === 0 ? <EmptyState size="md">Nenhum horário disponível nesta data. Escolha outro dia para continuar.</EmptyState> : null}
        {sequenceMessage ? <p role="status" className="mt-3 text-xs font-medium text-danger">{sequenceMessage}</p> : null}
        {time && selectedSlot && booking.settings.durationMode === "fixed_multiple" ? <div className="mt-3 rounded-xl border border-primary bg-primary/10 p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-lg font-semibold tabular-nums text-primary">{time} → {fixedMultipleEndTime(time, selectedSlot.durationMinutes, blocks)}</p><p className="text-xs text-muted">{blocks} {blocks === 1 ? "bloco selecionado" : "blocos consecutivos selecionados"}</p></div><span className="rounded-lg bg-primary px-2.5 py-1 text-sm font-bold text-white">{formatDuration(duration)}</span></div></div> : null}
        {time && booking.settings.durationMode === "fixed_multiple" ? <Button variant="outline" className="mt-3 w-full" onClick={() => setActiveStep("customer")}>Continuar com este horário</Button> : null}
      </ExpandedStep> : null}
      {time && activeStep === "customer" ? <ExpandedStep number={numberOf("customer")} title="Seus dados" description="Falta pouco para confirmar seu agendamento."><div className="space-y-4"><div className="space-y-2"><Label htmlFor="customer">Nome</Label><Input id="customer" value={customer} maxLength={120} autoComplete="name" onChange={(event) => setCustomer(event.target.value)} placeholder="Como podemos chamar você?" /></div><div className="space-y-2"><Label htmlFor="whatsapp">WhatsApp</Label><Input id="whatsapp" inputMode="tel" autoComplete="tel" maxLength={15} value={whatsapp} onChange={(event) => setWhatsapp(formatWhatsappInput(event.target.value))} placeholder="(00) 00000-0000" /><p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />Usaremos seu WhatsApp somente para informações sobre este agendamento.</p></div></div></ExpandedStep> : null}
      {message ? <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{message}</p> : null}
      {time && activeStep === "customer" ? <Card padding="md" className="bg-card lg:hidden"><p className="mb-4 text-sm font-semibold">Confira antes de confirmar</p>{summary}<div className="mt-5">{confirmationAction}</div></Card> : null}
    </main><aside className="sticky top-6 hidden lg:block"><Card padding="md" className="bg-card">{summary}<div className="mt-5">{confirmationAction}</div></Card></aside></div> : null}
    {preview ? <p className="mt-4 text-center text-xs text-muted">Pré-visualização da página pública</p> : null}
  </div></div>;
}
