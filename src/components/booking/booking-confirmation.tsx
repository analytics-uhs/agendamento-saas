"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { useMemo, useSyncExternalStore } from "react";
import { appearanceStyle } from "@/lib/appearance";
import { normalizeWhatsapp } from "@/lib/availability";
import { formatDuration, formatLongDate } from "@/lib/date";
import type { BookingConfirmation } from "@/types/public-booking";

function isConfirmation(value: unknown): value is BookingConfirmation {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<BookingConfirmation>;
  return Boolean(item.business?.name && item.business.slug && item.appointmentDate && item.startTime && item.endTime && typeof item.durationMinutes === "number" && item.customerName);
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

  return <main style={style} data-theme={confirmation?.appearance?.themePreference} className="flex min-h-screen items-center justify-center bg-surface px-4 py-10 text-foreground"><div className="w-full max-w-md rounded-2xl border bg-card p-6 text-center">
    <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary text-white"><CheckCircle2 className="h-7 w-7" /></span>
    <h1 className="mt-4 text-xl font-semibold">{confirmation ? "Tudo certo! Seu agendamento está confirmado. 😊" : "Confirmação do agendamento"}</h1>
    {confirmation ? <div className="mt-3 space-y-2 text-sm leading-relaxed text-muted"><p>Esperamos você no dia e horário agendados.</p><p>Se precisar cancelar ou fazer alguma alteração, entre em contato diretamente com o estabelecimento.</p></div> : <p className="mt-1 text-sm text-muted">Os detalhes desta confirmação não estão mais disponíveis neste dispositivo.</p>}
    {confirmation && whatsappNumber ? <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noopener noreferrer" className="focus-ring mt-5 flex min-h-12 w-full items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90">💬 Entrar em contato pelo WhatsApp</a> : null}
    {confirmation ? <dl className="mt-6 space-y-3 rounded-xl border p-4 text-left text-sm">
      <div className="flex justify-between gap-3"><dt className="text-muted">Estabelecimento</dt><dd className="font-medium">{confirmation.business.name}</dd></div>
      {confirmation.group1 ? <div className="flex justify-between gap-3"><dt className="text-muted">{confirmation.group1.label}</dt><dd className="font-medium">{confirmation.group1.name}</dd></div> : null}
      {confirmation.group2 ? <div className="flex justify-between gap-3"><dt className="text-muted">{confirmation.group2.label}</dt><dd className="font-medium">{confirmation.group2.name}</dd></div> : null}
      <div className="flex justify-between gap-3"><dt className="text-muted">Data</dt><dd className="font-medium capitalize">{formatLongDate(confirmation.appointmentDate)}</dd></div>
      <div className="flex justify-between gap-3"><dt className="text-muted">Horário</dt><dd className="font-medium">{confirmation.startTime}–{confirmation.endTime}</dd></div>
      <div className="flex justify-between gap-3"><dt className="text-muted">Duração</dt><dd className="font-medium">{formatDuration(confirmation.durationMinutes)}</dd></div>
    </dl> : null}
    <Link href={`/agendar/${slug}`} className="focus-ring mt-6 flex h-11 w-full items-center justify-center rounded-xl border bg-card text-sm font-semibold hover:bg-surface">Fazer novo agendamento</Link>
  </div></main>;
}
