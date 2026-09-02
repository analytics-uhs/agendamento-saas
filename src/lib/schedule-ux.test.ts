import test from "node:test";
import assert from "node:assert/strict";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TimeSlotList } from "@/components/booking/time-slot-list";
import { BusinessHoursEditor } from "@/components/business-hours-editor";
import { createEmptyBusinessForm } from "./business-form";
import { repeatBusinessHours, overwrittenBusinessDays } from "./repeat-business-hours";
import { selectFixedMultipleSlot } from "./fixed-multiple-selection";
import type { BookingSlot } from "@/types/public-booking";

function days() {
  return createEmptyBusinessForm().hours.map((day) => ({ ...day, active: false, windows: [] as { startTime: string; endTime: string }[] }));
}

test("repete todos os períodos :15/:45 e overnight somente nos destinos, com cópias independentes", () => {
  const hours = days();
  hours[1] = { ...hours[1], active: true, windows: [{ startTime: "08:15", endTime: "11:15" }, { startTime: "14:45", endTime: "18:15" }, { startTime: "19:15", endTime: "00:15" }] };
  const next = repeatBusinessHours(hours, 1, [2, 4]);
  assert.deepEqual(next[2].windows, hours[1].windows);
  assert.deepEqual(next[4].windows, hours[1].windows);
  assert.equal(next[3], hours[3]);
  next[2].windows[0].startTime = "09:30";
  assert.equal(next[4].windows[0].startTime, "08:15");
  assert.equal(hours[1].windows[0].startTime, "08:15");
});

test("repete um período e detecta sobrescrita antes de aplicar", () => {
  const hours = days();
  hours[1] = { ...hours[1], active: true, windows: [{ startTime: "18:15", endTime: "00:15" }] };
  hours[2] = { ...hours[2], active: true, windows: [{ startTime: "08:00", endTime: "12:00" }] };
  assert.deepEqual(overwrittenBusinessDays(hours, 1, [1, 2, 3]).map((day) => day.weekday), [2]);
  const next = repeatBusinessHours(hours, 1, [2]);
  assert.deepEqual(next[2].windows, hours[1].windows);
  assert.deepEqual(overwrittenBusinessDays(next, 1, [2]), []);
});

test("copiar Fechado limpa destinos escolhidos, não herda janelas ocultas nem modifica os demais", () => {
  const hours = days();
  hours[1].windows = [{ startTime: "18:15", endTime: "00:15" }];
  hours[2] = { ...hours[2], active: true, windows: [{ startTime: "08:00", endTime: "12:00" }] };
  assert.equal(overwrittenBusinessDays(hours, 1, [2]).length, 1);
  const next = repeatBusinessHours(hours, 1, [2]);
  assert.equal(next[2].active, false);
  assert.deepEqual(next[2].windows, []);
  assert.equal(next[1], hours[1]);
  assert.equal(next[3], hours[3]);
  assert.equal(repeatBusinessHours(hours, 99, [2]), hours);
});

test("editor compartilhado oferece repetição em cada dia, inclusive fechado", () => {
  const html = renderToStaticMarkup(createElement(BusinessHoursEditor, { hours: days(), onChange() {} }));
  assert.equal((html.match(/Repetir nos outros dias/g) ?? []).length, 7);
  assert.match(html, /Repetir horários de Domingo nos outros dias/);
});

const slots = ["18:00", "18:15", "18:30", "18:45", "19:00"].map((startTime) => ({ startTime, durationMinutes: 15, maxBlocks: 5 }));
test("lista temporal mantém todos os horários ordenados, agrupados e acessíveis", () => {
  const html = renderToStaticMarkup(createElement(TimeSlotList, { slots: [...slots].reverse(), selectedTimes: ["18:15"], onSelect() {} }));
  assert.equal((html.match(/<button/g) ?? []).length, 5);
  assert.equal((html.match(/role="group"/g) ?? []).length, 2);
  assert.match(html, /aria-label="18 horas"/);
  assert.match(html, /aria-label="Selecionar 18:15" aria-pressed="true"/);
  assert.deepEqual([...html.matchAll(/<time>(.*?)<\/time>/g)].map((match) => match[1]), slots.map((slot) => slot.startTime));
});

function elements(node: ReactNode): { onClick?: () => void; "aria-label"?: string }[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<{ children?: ReactNode; onClick?: () => void; "aria-label"?: string }>(node)) return [];
  return [node.props, ...elements(node.props.children)];
}
test("clicar entrega o slot original e preserva seleção de blocos consecutivos", () => {
  let selected: BookingSlot | undefined;
  const tree = TimeSlotList({ slots, selectedTimes: [], onSelect(slot) { selected = slot; } });
  elements(tree).find((props) => props["aria-label"] === "Selecionar 18:15")!.onClick!();
  assert.equal(selected, slots[1]);
  const result = selectFixedMultipleSlot(slots, "18:00", 1, selected!.startTime);
  assert.equal(result.rejected, false);
  assert.equal(result.blocks, 2);
});
