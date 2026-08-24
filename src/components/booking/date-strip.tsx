"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, dateWindow, dayNumber, formatShortDate, toISO, todayISO, weekdayShort } from "@/lib/date";
import { classes } from "@/lib/classes";

export function DateStrip({ windowStart, onWindowStartChange, selected, onSelect, isUnavailable, allowPast = false }: {
  windowStart: string; onWindowStartChange: (date: string) => void; selected: string | null;
  onSelect: (date: string) => void; isUnavailable?: (date: string) => boolean; allowPast?: boolean;
}) {
  const today = todayISO();
  const days = dateWindow(windowStart);
  return <div>
    <div className="mb-3 flex items-center justify-between gap-2">
      <button type="button" disabled={!allowPast && windowStart <= today} onClick={() => onWindowStartChange(toISO(addDays(windowStart, -7)))} aria-label="7 dias anteriores" className="focus-ring grid h-10 w-10 place-items-center rounded-xl border bg-card transition-colors hover:border-primary hover:text-primary disabled:opacity-35"><ChevronLeft className="h-4 w-4" /></button>
      <div className="text-center">
        <button type="button" onClick={() => onWindowStartChange(today)} className="focus-ring rounded-lg px-3 py-1 text-sm font-semibold text-primary hover:bg-primary/5">Hoje</button>
        <p className="mt-0.5 text-[11px] capitalize text-muted">{formatShortDate(days[0])} – {formatShortDate(days[6])}</p>
      </div>
      <button type="button" onClick={() => onWindowStartChange(toISO(addDays(windowStart, 7)))} aria-label="Próximos 7 dias" className="focus-ring grid h-10 w-10 place-items-center rounded-xl border bg-card transition-colors hover:border-primary hover:text-primary"><ChevronRight className="h-4 w-4" /></button>
    </div>
    <div className="relative -mx-1">
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-1 pb-1 pr-7 sm:pr-1">
      {days.map((date) => {
        const unavailable = isUnavailable?.(date) ?? false;
        const selectedDate = selected === date;
        return <button key={date} type="button" disabled={unavailable} onClick={() => onSelect(date)} aria-current={selectedDate ? "date" : undefined} aria-label={`${date === today ? "Hoje" : weekdayShort(date)}, dia ${dayNumber(date)}${unavailable ? ", indisponível" : ""}`} className={classes("focus-ring flex min-h-16 min-w-[62px] flex-1 flex-col items-center justify-center gap-1 rounded-xl border bg-card py-2.5 tabular-nums transition-colors hover:border-primary", date === today && !selectedDate && "border-primary/60 text-primary", selectedDate && "border-primary bg-primary text-white", unavailable && "cursor-not-allowed border-dashed bg-surface text-muted opacity-55")}>
          <span className="text-[10px] font-semibold uppercase tracking-wide opacity-85">{date === today ? "Hoje" : weekdayShort(date)}</span><span className="text-lg font-semibold leading-none">{dayNumber(date)}</span>
        </button>;
      })}
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-7 bg-linear-to-l from-card to-transparent sm:hidden" />
    </div>
    <p className="mt-2 text-right text-[11px] text-muted sm:hidden">Deslize para ver os próximos dias</p>
  </div>;
}
