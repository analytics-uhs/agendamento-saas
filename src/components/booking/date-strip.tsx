"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, dateWindow, dayNumber, toISO, todayISO, weekdayShort } from "@/lib/date";
import { classes } from "@/lib/classes";

export function DateStrip({ windowStart, onWindowStartChange, selected, onSelect, isUnavailable }: {
  windowStart: string; onWindowStartChange: (date: string) => void; selected: string | null;
  onSelect: (date: string) => void; isUnavailable?: (date: string) => boolean;
}) {
  const today = todayISO();
  const days = dateWindow(windowStart);
  return <div>
    <div className="mb-3 flex items-center justify-between gap-2">
      <button type="button" disabled={windowStart <= today} onClick={() => onWindowStartChange(toISO(addDays(windowStart, -7)))} aria-label="7 dias anteriores" className="focus-ring grid h-9 w-9 place-items-center rounded-lg border disabled:opacity-35"><ChevronLeft className="h-4 w-4" /></button>
      <button type="button" onClick={() => onWindowStartChange(today)} className="focus-ring rounded-lg px-3 py-1.5 text-sm font-medium text-muted hover:text-foreground">Hoje</button>
      <button type="button" onClick={() => onWindowStartChange(toISO(addDays(windowStart, 7)))} aria-label="Próximos 7 dias" className="focus-ring grid h-9 w-9 place-items-center rounded-lg border"><ChevronRight className="h-4 w-4" /></button>
    </div>
    <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {days.map((date) => {
        const unavailable = isUnavailable?.(date) ?? false;
        const selectedDate = selected === date;
        return <button key={date} type="button" disabled={unavailable} onClick={() => onSelect(date)} className={classes("focus-ring flex min-w-[62px] flex-1 flex-col items-center gap-1 rounded-xl border bg-card py-3 transition-colors", date === today && !selectedDate && "border-primary/50", selectedDate && "border-primary bg-primary text-white", unavailable && "cursor-not-allowed opacity-35 line-through")}>
          <span className="text-[11px] font-semibold uppercase opacity-80">{date === today ? "Hoje" : weekdayShort(date)}</span><span className="text-lg font-semibold leading-none">{dayNumber(date)}</span>
        </button>;
      })}
    </div>
  </div>;
}
