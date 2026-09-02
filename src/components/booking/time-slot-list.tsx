"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { classes } from "@/lib/classes";
import type { BookingSlot } from "@/types/public-booking";

export function TimeSlotList({ slots, selectedTimes, onSelect }: {
  slots: BookingSlot[];
  selectedTimes: string[];
  onSelect: (slot: BookingSlot) => void;
}) {
  const groups = new Map<string, BookingSlot[]>();
  for (const slot of [...slots].sort((a, b) => a.startTime.localeCompare(b.startTime))) {
    const hour = slot.startTime.slice(0, 2);
    groups.set(hour, [...(groups.get(hour) ?? []), slot]);
  }
  return <div aria-label="Horários disponíveis" className="divide-y border-y">
    {[...groups].map(([hour, options]) => <div key={hour} role="group" aria-label={`${hour} horas`} className="grid grid-cols-[3rem_minmax(0,1fr)] gap-2 py-1">
      <span aria-hidden="true" className="pt-3 text-sm font-semibold tabular-nums text-muted">{hour}h</span>
      <div className="border-l pl-2">
        {options.map((slot) => {
          const selected = selectedTimes.includes(slot.startTime);
          return <Button key={slot.startTime} variant="ghost" aria-label={`Selecionar ${slot.startTime}`} aria-pressed={selected}
            className={classes("w-full tabular-nums", selected && "bg-primary/10 ring-1 ring-inset ring-primary hover:bg-primary/15")}
            onClick={() => onSelect(slot)}>
            <span className={classes("flex w-full items-center justify-between gap-2", selected ? "text-primary" : "text-foreground")}><time>{slot.startTime}</time>
            {selected ? <><span className="ml-auto mr-2 text-xs">Selecionado</span><Check className="h-4 w-4" /></> : <span className="text-xs font-normal text-muted">Selecionar</span>}
            </span>
          </Button>;
        })}
      </div>
    </div>)}
  </div>;
}
