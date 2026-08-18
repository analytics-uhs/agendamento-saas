"use client";

import { CheckCircle2, Clock3, LoaderCircle, MapPin } from "lucide-react";
import { useMemo, useRef, useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { createPublicBooking, getAvailability } from "@/app/agendar/[slug]/actions";
import { DateStrip } from "@/components/booking/date-strip";
import { useMockApp } from "@/components/mock-app-provider";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { Logo } from "@/components/ui/logo";
import { FacebookIcon, InstagramIcon, WhatsappIcon } from "@/components/ui/social-icons";
import { classes } from "@/lib/classes";
import { normalizeWhatsapp } from "@/lib/availability";
import { formatDuration, formatLongDate, parseISO, todayISO } from "@/lib/date";
import { getPalette } from "@/lib/palettes";
import type { BookingSlot, PublicBookingData } from "@/types/public-booking";
import type { VisualThemePreference } from "@/types/business";
import type { MockAppState } from "@/types/scheduling";

function Section({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return <section className="step-in mt-7"><h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-[11px] font-bold text-white">{number}</span>{title}</h2>{children}</section>;
}

function previewData(state: MockAppState, paletteId?: string, themePreference: VisualThemePreference = "light"): PublicBookingData {
  const dayToWeekday = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 } as const;
  return {
    business: { id: "preview", name: state.business.name, slug: state.business.slug, whatsapp: state.business.whatsapp, logoUrl: null, address: null, googleMapsUrl: null, instagramUrl: null, facebookUrl: null },
    groups: [
      ...(state.group1.enabled ? [{ position: 1 as const, label: state.group1.label, required: true, options: state.group1.options.map((option) => ({ id: option.id, name: option.name, durationMinutes: null })) }] : []),
      ...(state.group2.enabled ? [{ position: 2 as const, label: state.group2.label, required: true, options: state.group2.options.map((option) => ({ id: option.id, name: option.name, durationMinutes: option.durationMinutes ?? null })) }] : []),
    ],
    hours: state.hours.filter((hour) => hour.enabled).map((hour) => ({ weekday: dayToWeekday[hour.day], startTime: hour.start, endTime: hour.end })),
    settings: {
      durationMode: state.duration.mode === "fixed-multiple" ? "fixed_multiple" : state.duration.mode === "group2" ? "group_2" : "fixed",
      fixedDurationMinutes: state.duration.fixedMinutes,
      allowMultipleBlocks: state.duration.mode === "fixed-multiple",
      palette: getPalette(paletteId ?? state.paletteId),
      themePreference,
    },
  };
}

function LogoMark({ booking }: { booking: PublicBookingData }) {
  if (!booking.business.logoUrl) return <Logo name={booking.business.name} size="lg" />;
  return <span role="img" aria-label={`Logo de ${booking.business.name}`} className="h-16 w-16 rounded-2xl bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${JSON.stringify(booking.business.logoUrl).slice(1, -1)})` }} />;
}

export function BookingFlow({ booking: bookingProp, preview = false, paletteId, themePreference }: { booking?: PublicBookingData; preview?: boolean; paletteId?: string; themePreference?: VisualThemePreference }) {
  const router = useRouter();
  const { state } = useMockApp();
  const booking = bookingProp ?? previewData(state, paletteId, themePreference);
  const groupOne = booking.groups.find((group) => group.position === 1);
  const groupTwo = booking.groups.find((group) => group.position === 2);
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
  const availabilityRequest = useRef(0);
  const [isLoadingSlots, startSlotsTransition] = useTransition();
  const [isSubmitting, startSubmitTransition] = useTransition();
  const darkTheme = booking.settings.themePreference === "dark";
  const palette = darkTheme ? { ...booking.settings.palette, background: "#181818", surface: "#242424", text: "#F5F5F5", muted: "#AAAAAA", border: "#3A3A3A" } : booking.settings.palette;
  const style = { "--primary": palette.primary, "--accent": palette.accent, "--background": palette.background, "--surface": palette.surface, "--foreground": palette.text, "--muted": palette.muted, "--border": palette.border, "--card": palette.background } as CSSProperties;
  const group1Done = !groupOne || Boolean(group1);
  const group2Done = group1Done && (!groupTwo || Boolean(group2));
  const selectedSlot = slots.find((slot) => slot.startTime === time);
  const duration = useMemo(() => (selectedSlot?.durationMinutes ?? booking.settings.fixedDurationMinutes) * (booking.settings.durationMode === "fixed_multiple" ? blocks : 1), [selectedSlot, booking.settings, blocks]);
  const canConfirm = Boolean(date && time && customer.trim().length >= 2 && whatsapp.trim() && group1Done && group2Done && !isSubmitting);
  const configurationInvalid = Boolean((groupOne && groupOne.options.length === 0) || (groupTwo && groupTwo.options.length === 0));

  function resetSchedule() {
    availabilityRequest.current += 1;
    setDate(null);
    setTime(null);
    setSlots([]);
    setBlocks(1);
    setMessage(null);
  }

  function loadSlots(selectedDate: string) {
    const request = ++availabilityRequest.current;
    setDate(selectedDate);
    setTime(null);
    setBlocks(1);
    setSlots([]);
    setMessage(null);
    if (preview) {
      const hour = booking.hours.find((item) => item.weekday === parseISO(selectedDate).getDay());
      if (!hour) return;
      const base = booking.settings.durationMode === "group_2" ? groupTwo?.options.find((option) => option.id === group2)?.durationMinutes ?? 30 : booking.settings.fixedDurationMinutes;
      const [startHour = 0, startMinute = 0] = hour.startTime.split(":").map(Number);
      const [endHour = 0, endMinute = 0] = hour.endTime.split(":").map(Number);
      const start = startHour * 60 + startMinute;
      const end = endHour * 60 + endMinute;
      setSlots(Array.from({ length: Math.max(0, Math.floor((end - start) / base)) }, (_, index) => ({ startTime: `${String(Math.floor((start + index * base) / 60)).padStart(2, "0")}:${String((start + index * base) % 60).padStart(2, "0")}`, durationMinutes: base, maxBlocks: Math.min(3, Math.floor((end - start - index * base) / base)) })));
      return;
    }
    startSlotsTransition(async () => {
      const result = await getAvailability({ slug: booking.business.slug, date: selectedDate, group1OptionId: group1, group2OptionId: group2 });
      if (request !== availabilityRequest.current) return;
      if (result.ok) setSlots(result.data);
      else setMessage(result.message);
    });
  }

  function confirm() {
    if (preview || !date || !time || !canConfirm) return;
    setMessage(null);
    startSubmitTransition(async () => {
      const result = await createPublicBooking({ slug: booking.business.slug, group1OptionId: group1, group2OptionId: group2, date, startTime: time, blocks, customerName: customer, customerWhatsapp: whatsapp });
      if (!result.ok) {
        if (result.staleSelection) {
          setGroup1(null);
          setGroup2(null);
          resetSchedule();
        }
        if (result.conflict) loadSlots(date);
        setMessage(result.message);
        return;
      }
      sessionStorage.setItem(`booking-confirmation:${booking.business.slug}`, JSON.stringify(result.data));
      router.push(`/agendar/${booking.business.slug}/confirmacao`);
    });
  }

  let step = 0;
  return <div style={style} data-theme={booking.settings.themePreference} className="min-h-screen bg-surface text-foreground"><div className={classes("mx-auto w-full max-w-md px-4 pb-16 pt-8", preview && "scale-[0.98]")}>
    <header className="flex flex-col items-center text-center"><LogoMark booking={booking} /><h1 className="mt-3 text-xl font-semibold">{booking.business.name}</h1>{booking.business.address ? <p className="mt-1.5 flex max-w-sm items-start justify-center gap-1.5 text-xs leading-relaxed text-muted"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />{booking.business.address}</p> : null}<div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">{booking.business.whatsapp ? <a href={`https://wa.me/${normalizeWhatsapp(booking.business.whatsapp)}`} target="_blank" rel="noopener noreferrer" className="focus-ring inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1.5 text-xs font-medium hover:border-primary hover:text-primary" aria-label={`Falar com ${booking.business.name} pelo WhatsApp`}><WhatsappIcon className="h-3.5 w-3.5" />{booking.business.whatsapp}</a> : null}{booking.business.googleMapsUrl ? <a href={booking.business.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-full border bg-card text-muted hover:border-primary hover:text-primary" aria-label="Abrir localização no Google Maps" title="Google Maps"><MapPin className="h-3.5 w-3.5" /></a> : null}{booking.business.instagramUrl ? <a href={booking.business.instagramUrl} target="_blank" rel="noopener noreferrer" className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-full border bg-card text-muted hover:border-primary hover:text-primary" aria-label="Abrir Instagram" title="Instagram"><InstagramIcon className="h-3.5 w-3.5" /></a> : null}{booking.business.facebookUrl ? <a href={booking.business.facebookUrl} target="_blank" rel="noopener noreferrer" className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-full border bg-card text-muted hover:border-primary hover:text-primary" aria-label="Abrir Facebook" title="Facebook"><FacebookIcon className="h-3.5 w-3.5" /></a> : null}</div></header>
    {configurationInvalid ? <p className="mt-7 rounded-xl border border-dashed p-6 text-center text-sm text-muted">O agendamento online ainda está sendo configurado. Tente novamente mais tarde.</p> : null}
    {!configurationInvalid && groupOne ? <Section number={++step} title={groupOne.label}><div className="space-y-2">{groupOne.options.map((option) => <button key={option.id} type="button" onClick={() => { setGroup1(option.id); setGroup2(null); resetSchedule(); }} className={classes("focus-ring flex w-full items-center gap-3 rounded-xl border bg-card p-4 text-left", group1 === option.id && "border-primary bg-primary/5")}><span className="flex-1 truncate text-sm font-medium">{option.name}</span>{group1 === option.id ? <CheckCircle2 className="h-5 w-5 text-primary" /> : null}</button>)}</div></Section> : null}
    {!configurationInvalid && groupTwo && group1Done ? <Section number={++step} title={groupTwo.label}><div className="space-y-2">{groupTwo.options.map((option) => <button key={option.id} type="button" onClick={() => { setGroup2(option.id); resetSchedule(); }} className={classes("focus-ring flex w-full items-center gap-3 rounded-xl border bg-card p-4 text-left", group2 === option.id && "border-primary bg-primary/5")}><span className="flex-1 truncate text-sm font-medium">{option.name}</span>{booking.settings.durationMode === "group_2" ? <span className="text-xs text-muted">{formatDuration(option.durationMinutes ?? 0)}</span> : null}{group2 === option.id ? <CheckCircle2 className="h-5 w-5 text-primary" /> : null}</button>)}</div></Section> : null}
    {!configurationInvalid && group2Done ? <Section number={++step} title="Data"><DateStrip windowStart={windowStart} onWindowStartChange={(value) => { setWindowStart(value); resetSchedule(); }} selected={date} onSelect={loadSlots} isUnavailable={(value) => value < todayISO() || !booking.hours.some((hour) => hour.weekday === parseISO(value).getDay())} /></Section> : null}
    {date ? <Section number={++step} title="Horário">{isLoadingSlots ? <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed p-6 text-sm text-muted"><LoaderCircle className="h-4 w-4 animate-spin" />Consultando horários...</div> : <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{slots.map((slot) => <button key={slot.startTime} type="button" onClick={() => { setTime(slot.startTime); setBlocks(1); setMessage(null); }} className={classes("focus-ring rounded-xl border bg-card py-3 text-sm font-semibold", time === slot.startTime && "border-primary bg-primary text-white")}>{slot.startTime}</button>)}</div>}{!isLoadingSlots && slots.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted">Nenhum horário disponível nesta data.</p> : null}
      {time && selectedSlot && booking.settings.durationMode === "fixed_multiple" ? <div className="mt-4"><p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted"><Clock3 className="h-3.5 w-3.5" />Duração a partir de {time}</p><div className="flex flex-wrap gap-2">{Array.from({ length: selectedSlot.maxBlocks }, (_, index) => index + 1).map((count) => <button key={count} type="button" onClick={() => setBlocks(count)} className={classes("focus-ring rounded-xl border bg-card px-4 py-2.5 text-sm font-semibold", blocks === count && "border-primary bg-primary text-white")}>{formatDuration(selectedSlot.durationMinutes * count)}</button>)}</div></div> : null}
    </Section> : null}
    {time ? <Section number={++step} title="Seus dados"><div className="space-y-3"><div className="space-y-2"><Label htmlFor="customer">Nome</Label><Input id="customer" value={customer} maxLength={120} onChange={(event) => setCustomer(event.target.value)} placeholder="Seu nome" /></div><div className="space-y-2"><Label htmlFor="whatsapp">WhatsApp</Label><Input id="whatsapp" inputMode="tel" value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} placeholder="(00) 00000-0000" /></div></div></Section> : null}
    {message ? <p role="alert" className="mt-5 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">{message}</p> : null}
    {time && date ? <><div className="step-in mt-6 rounded-xl border bg-card p-4 text-sm"><p className="text-muted">Resumo</p><p className="mt-1 font-medium">{[groupOne?.options.find((option) => option.id === group1)?.name, groupTwo?.options.find((option) => option.id === group2)?.name].filter(Boolean).join(" · ")}</p><p className="capitalize text-muted">{formatLongDate(date)} · {time} · {formatDuration(duration)}</p></div><Button className="mt-4 h-12 w-full text-base" disabled={!canConfirm || preview} onClick={confirm}>{isSubmitting ? <><LoaderCircle className="h-4 w-4 animate-spin" />Confirmando...</> : "Confirmar agendamento"}</Button></> : null}
    {preview ? <p className="mt-4 text-center text-xs text-muted">Pré-visualização da página pública</p> : null}
  </div></div>;
}
