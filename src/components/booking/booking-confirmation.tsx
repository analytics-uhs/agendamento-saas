"use client";

import Link from "next/link";
import { CalendarDays, Check, Clock3 } from "lucide-react";
import { useMemo, useSyncExternalStore } from "react";
import { BusinessLogo } from "@/components/ui/business-logo";
import { WhatsappIcon } from "@/components/ui/social-icons";
import { appearanceStyle } from "@/lib/appearance";
import { normalizeWhatsapp } from "@/lib/availability";
import { formatBookingTimeRange } from "@/lib/time-of-day";
import { formatDuration, formatLongDate } from "@/lib/date";
import type { BookingConfirmation } from "@/types/public-booking";

function isConfirmation(value: unknown): value is BookingConfirmation {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<BookingConfirmation>;
  return Boolean(item.business?.name && item.business.slug && item.appointmentDate && item.customerName && (item.startTime || item.complementary));
}

export function BookingConfirmationView({ slug }: { slug: string }) {
  const stored = useSyncExternalStore(
    () => () => undefined,
    () => sessionStorage.getItem(`booking-confirmation:${slug}`),
    () => null,
  );
  const confirmation = useMemo(() => {
    try {
      const parsed: unknown = stored ? JSON.parse(stored) : null;
      return isConfirmation(parsed) && parsed.business.slug === slug ? parsed : null;
    } catch {
      return null;
    }
  }, [slug, stored]);

  return <BookingConfirmationCard slug={slug} confirmation={confirmation} />;
}

export function BookingConfirmationCard({ slug, confirmation }: { slug: string; confirmation: BookingConfirmation | null }) {
  const whatsappNumber = confirmation?.business.whatsapp ? normalizeWhatsapp(confirmation.business.whatsapp) : "";
  const configuredPalette = confirmation?.appearance?.palette;
  const style = configuredPalette && confirmation?.appearance
    ? appearanceStyle(configuredPalette, confirmation.appearance.themePreference)
    : undefined;
  const isComplementaryOnly = Boolean(confirmation?.complementary && !confirmation.group1 && !confirmation.group2);

  return <main style={style} data-theme={confirmation?.appearance?.themePreference} className="flex min-h-screen justify-center bg-surface px-4 py-6 text-foreground sm:items-center sm:py-10"><div className="w-full max-w-md text-center">
    {confirmation ? <div className="mb-10 flex items-center justify-center gap-2"><BusinessLogo name={confirmation.business.name} logoUrl={confirmation.business.logoUrl} size="sm" /><p className="text-sm font-semibold">{confirmation.business.name}</p></div> : null}
    <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-success/10 text-success"><Check className="h-7 w-7" strokeWidth={2.5} /></span>
    <h1 className="mt-4 text-2xl font-semibold tracking-[-0.02em]">{confirmation ? isComplementaryOnly ? "Sua reserva está confirmada." : "Seu horário está confirmado." : "Confirmação da reserva"}</h1>
    {confirmation ? <div className="mx-auto mt-2 max-w-sm space-y-2 text-sm leading-relaxed text-muted"><p>{isComplementaryOnly ? "Tudo certo! Esperamos você na data reservada." : "Tudo certo! Esperamos você no dia e horário agendados."}</p></div> : <p className="mt-2 text-sm text-muted">Os detalhes desta confirmação não estão mais disponíveis neste dispositivo.</p>}
    {confirmation ? <dl className="mt-7 space-y-3 rounded-xl border bg-card p-4 text-left text-sm">
      <div className="flex items-center gap-3 border-b pb-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><CalendarDays className="h-5 w-5" /></span><div className="min-w-0"><dt className="sr-only">Data e horário</dt><dd className="font-semibold capitalize">{formatLongDate(confirmation.appointmentDate)}</dd>{confirmation.startTime && confirmation.endTime && confirmation.durationMinutes ? <dd className="mt-0.5 flex items-center gap-1.5 text-xs text-muted"><Clock3 className="h-3.5 w-3.5" />{formatBookingTimeRange(confirmation.startTime, confirmation.endTime ?? confirmation.startTime)} · {formatDuration(confirmation.durationMinutes)}</dd> : <dd className="mt-0.5 text-xs text-muted">Reserva do dia</dd>}</div></div>
      <div className="flex justify-between gap-3"><dt className="text-muted">Estabelecimento</dt><dd className="text-right font-medium">{confirmation.business.name}</dd></div>
      {confirmation.group1 ? <div className="flex justify-between gap-3"><dt className="text-muted">{confirmation.group1.label}</dt><dd className="font-medium">{confirmation.group1.name}</dd></div> : null}
      {confirmation.group2 ? <div className="flex justify-between gap-3"><dt className="text-muted">{confirmation.group2.label}</dt><dd className="font-medium">{confirmation.group2.name}</dd></div> : null}
      {confirmation.complementary ? <div className="border-t pt-3"><div className="flex justify-between gap-3"><dt className="text-muted">{confirmation.complementary.label}</dt><dd className="font-medium">{confirmation.complementary.name}</dd></div><p className="mt-1 text-right text-xs text-muted">{confirmation.complementary.occupancyMode === "day" ? "Reserva do dia" : `${confirmation.complementary.startTime}–${confirmation.complementary.endTime}`}</p></div> : null}
      <div className="flex justify-between gap-3"><dt className="text-muted">Cliente</dt><dd className="text-right font-medium">{confirmation.customerName}</dd></div>
    </dl> : null}
    {confirmation ? <p className="mx-auto mt-4 max-w-sm text-center text-xs leading-relaxed text-muted">Se precisar cancelar ou fazer alguma alteração, entre em contato diretamente com o estabelecimento.</p> : null}
    {confirmation && whatsappNumber ? <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noopener noreferrer" className="focus-ring mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-success bg-card px-4 py-3 text-sm font-semibold text-success transition-colors hover:bg-success/10"><WhatsappIcon className="h-4 w-4" />Entrar em contato pelo WhatsApp</a> : null}
    <Link href={`/agendar/${slug}`} className="focus-ring mt-5 inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold text-primary hover:bg-primary/5">Fazer novo agendamento</Link>
  </div></main>;
}
