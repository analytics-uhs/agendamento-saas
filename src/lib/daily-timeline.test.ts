import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DailyTimeline } from "@/components/admin/daily-timeline";
import { dailyTimelineRange, nearestTimelineSlot, timelineGeometry, timelineInterval, timelineLanes, timelineMinuteAt } from "./daily-timeline";
import type { AdminAppointment, CalendarBlock } from "@/types/appointments";

const appointment = (startTime: string, endTime: string, id = startTime) => ({ id, startTime, endTime, group1: { id }, customerName: id, status: "scheduled" }) as AdminAppointment;

test("shared hour band positions :00/:15/:30/:45 proportionally; duration crosses hour lines", () => {
  for (const [start, end, top] of [["18:00", "19:00", 0], ["18:15", "19:15", 24], ["18:30", "19:30", 48], ["18:45", "19:45", 72]] as const) {
    assert.deepEqual(timelineGeometry(appointment(start, end), 1080), { top, height: 96 });
  }
  assert.deepEqual(timelineGeometry(appointment("18:30", "20:00"), 1080), { top: 48, height: 144 });
  assert.equal(timelineGeometry(appointment("18:00", "18:30"), 1080).height, 48);
});

test("range includes out-of-hours events and blocks, rounds only the axis, keeps closed days usable", () => {
  assert.deepEqual(dailyTimelineRange([{ startTime: "18:15", endTime: "23:15" }], [appointment("16:00", "17:00"), appointment("16:15", "17:15")], []), { start: 960, end: 1440 });
  assert.deepEqual(dailyTimelineRange([], [], [{ startTime: "18:30", endTime: "20:00" } as CalendarBlock]), { start: 1080, end: 1200 });
  assert.deepEqual(dailyTimelineRange([], [], []), { start: 480, end: 1200 });
});

test("midnight and carry-ins remain on their civil day", () => {
  assert.deepEqual(timelineInterval(appointment("23:15", "00:15")), { start: 1395, end: 1440 });
  assert.deepEqual(timelineGeometry({ ...appointment("23:15", "00:15"), calendarStartTime: "00:00", calendarEndTime: "00:15" }, 0), { top: 0, height: 24 });
});

test("click and keyboard snap to returned Admin cadence, including times outside public windows", () => {
  const minute = timelineMinuteAt(24, 1080, 1440);
  assert.equal(minute, 1095);
  assert.equal(nearestTimelineSlot(["16:15", "17:15", "18:15", "19:15"].map((startTime) => ({ startTime })), minute), "18:15");
  assert.equal(nearestTimelineSlot([{ startTime: "16:15" }, { startTime: "18:15" }], 960), "16:15");
  assert.equal(nearestTimelineSlot([], minute), undefined);
  assert.equal(timelineMinuteAt(-30, 960, 1440), 960);
});

test("overlapping cancelled/history items remain reachable, adjacent events reuse full width", () => {
  const items = timelineLanes([appointment("18:00", "19:00", "a"), appointment("18:15", "19:15", "b"), appointment("19:15", "20:00", "c")]);
  assert.deepEqual(items.map(({ lane, lanes }) => [lane, lanes]), [[0, 2], [1, 2], [0, 1]]);
});

test("real timeline renders full-hour axis and proportional resource blocks, never closed cells", () => {
  const appointments = [appointment("16:00", "17:00", "a"), appointment("16:15", "17:15", "b")];
  const html = renderToStaticMarkup(createElement(DailyTimeline, {
    resources: [{ id: "a", name: "Quadra frente" }, { id: "b", name: "Quadra fundo" }],
    selectedResourceId: "a", onResourceChange() {}, windows: [], appointments,
    blocks: [], canCreate: true, onCreate() {},
    renderAppointment: (item) => createElement("button", { type: "button" }, item.startTime), renderBlock: () => null,
  }));
  assert.match(html, /data-event-id="b"[^>]*top:24px;height:96px/);
  assert.equal((html.match(/data-hour="16"/g) ?? []).length, 2); // desktop + mobile share the same renderer
  assert.doesNotMatch(html, /data-hour="16\.25"|Fora do funcionamento|bg-muted\/10|<table/);
  assert.match(html, /Novo agendamento para Quadra fundo/);
});
