"use client";

import { useState, type ReactNode } from "react";
import { classes } from "@/lib/classes";
import { dailyTimelineRange, timelineGeometry, timelineLanes, timelineMinuteAt, TIMELINE_HOUR_HEIGHT } from "@/lib/daily-timeline";
import { minutesToTime } from "@/lib/time-of-day";
import type { DailyCalendarResource } from "@/lib/daily-calendar";
import type { AdminAppointment, CalendarBlock, DailyCalendarWindow } from "@/types/appointments";

type Props = {
  resources: DailyCalendarResource[];
  selectedResourceId: string | null;
  onResourceChange: (id: string | null) => void;
  windows: DailyCalendarWindow[];
  appointments: AdminAppointment[];
  blocks: CalendarBlock[];
  canCreate: boolean;
  onCreate: (minute: number, resourceId: string | null) => void;
  renderAppointment: (item: AdminAppointment, height: number) => ReactNode;
  renderBlock: (item: CalendarBlock, height: number) => ReactNode;
};

export function DailyTimeline(props: Props) {
  const range = dailyTimelineRange(props.windows, props.appointments, props.blocks);
  const selected = props.resources.find((resource) => resource.id === props.selectedResourceId) ?? props.resources[0];
  return <section aria-label="Agenda por horário" className="mt-4">
    {props.resources.length > 1 ? <div className="mb-3 flex gap-2 overflow-x-auto pb-1 md:hidden" aria-label="Selecionar agenda">
      {props.resources.map((resource) => <button key={resource.id ?? "business"} type="button" aria-pressed={resource.id === selected?.id} onClick={() => props.onResourceChange(resource.id)} className={classes("focus-ring shrink-0 rounded-full border px-4 py-2 text-sm font-semibold", resource.id === selected?.id ? "border-primary bg-primary text-white" : "bg-card")}>
        {resource.name}
      </button>)}
    </div> : null}
    <div className="hidden md:block"><TimelineGrid {...props} range={range} /></div>
    {selected ? <div className="md:hidden"><TimelineGrid {...props} resources={[selected]} range={range} /></div> : null}
    {props.canCreate ? <p className="mt-2 text-xs text-muted">Toque em um espaço livre para agendar. O horário será ajustado à cadência da opção. No teclado, use as setas e Enter.</p> : null}
  </section>;
}

function TimelineGrid(props: Props & { range: { start: number; end: number } }) {
  const { range } = props;
  const hours = Array.from({ length: (range.end - range.start) / 60 + 1 }, (_, index) => range.start + index * 60);
  const height = (range.end - range.start) / 60 * TIMELINE_HOUR_HEIGHT;
  return <div className="max-h-[70vh] overflow-auto rounded-xl border bg-background" tabIndex={0} aria-label="Linha do tempo rolável">
    <div className="grid" style={{ gridTemplateColumns: `64px repeat(${props.resources.length}, minmax(176px, 1fr))`, minWidth: 64 + props.resources.length * 176 }}>
      <div className="sticky left-0 top-0 z-30 border-b border-r bg-background px-1 py-3 text-center text-xs font-semibold text-muted">Horário</div>
      {props.resources.map((resource) => <div key={resource.id ?? "business"} className="sticky top-0 z-20 border-b border-r bg-background px-2 py-3 text-center text-sm font-semibold last:border-r-0">{resource.name}</div>)}
      <div className="sticky left-0 z-10 border-r bg-background" style={{ height }} aria-label="Eixo de horas">
        {hours.map((minute) => <span key={minute} data-hour={minute / 60} className="absolute right-2 text-xs font-medium tabular-nums text-muted" style={{ top: (minute - range.start) / 60 * TIMELINE_HOUR_HEIGHT, transform: minute === range.start ? "translateY(2px)" : "translateY(-100%)" }}>{minute === 1440 ? "24h" : `${minute / 60}h`}</span>)}
      </div>
      {props.resources.map((resource) => <ResourceColumn key={resource.id ?? "business"} {...props} resource={resource} hours={hours} height={height} />)}
    </div>
  </div>;
}

function ResourceColumn({ resource, hours, height, range, ...props }: Props & { resource: DailyCalendarResource; hours: number[]; height: number; range: { start: number; end: number } }) {
  const [keyboardMinute, setKeyboardMinute] = useState(range.start);
  const [focused, setFocused] = useState(false);
  const minute = Math.max(range.start, Math.min(range.end - 1, keyboardMinute));
  const entries = [
    ...props.appointments.filter((item) => resource.id === null || item.group1?.id === resource.id).map((item) => ({ ...item, kind: "appointment" as const })),
    ...props.blocks.filter((item) => resource.id === null || item.group1?.id === resource.id).map((item) => ({ ...item, kind: "block" as const })),
  ];
  return <div className="relative border-r last:border-r-0" style={{ height }} aria-label={resource.name}>
    {hours.slice(0, -1).map((hour) => <div key={hour} aria-hidden="true" className="pointer-events-none absolute inset-x-0 border-t" style={{ top: (hour - range.start) / 60 * TIMELINE_HOUR_HEIGHT }} />)}
    {props.canCreate ? <button type="button" className="focus-ring absolute inset-0 w-full text-left" aria-label={`Novo agendamento para ${resource.name}, próximo de ${minutesToTime(minute)}. Use setas para escolher e Enter para continuar.`}
      onClick={(event) => { if (event.detail === 0) { props.onCreate(minute, resource.id); return; } props.onCreate(timelineMinuteAt(event.clientY - event.currentTarget.getBoundingClientRect().top, range.start, range.end), resource.id); }}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      onKeyDown={(event) => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setKeyboardMinute(Math.max(range.start, Math.min(range.end - 1, minute + (event.key === "ArrowDown" ? 15 : -15)))); } }}>
      {focused ? <span className="pointer-events-none absolute inset-x-0 border-t border-primary bg-primary/10 text-right text-xs text-primary" style={{ top: (minute - range.start) / 60 * TIMELINE_HOUR_HEIGHT }}>{minutesToTime(minute)}</span> : null}
    </button> : null}
    {timelineLanes(entries).map(({ item, lane, lanes }) => {
      const geometry = timelineGeometry(item, range.start);
      return <div key={`${item.kind}-${item.id}`} data-event-id={item.id} className="absolute overflow-hidden px-0.5 pb-0.5" style={{ ...geometry, left: `${lane / lanes * 100}%`, width: `${100 / lanes}%` }}>
        {item.kind === "appointment" ? props.renderAppointment(item, geometry.height) : props.renderBlock(item, geometry.height)}
      </div>;
    })}
  </div>;
}
