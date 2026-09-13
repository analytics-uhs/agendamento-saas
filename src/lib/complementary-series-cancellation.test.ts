import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { AdminComplementaryReservation } from "@/types/appointments";

function load<T>(path: string, dependencies: Record<string, unknown>): T {
  const exports = {};
  const code = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(code, { exports, require: (name: string) => {
    if (!(name in dependencies)) throw Error(name);
    return dependencies[name];
  } });
  return exports as T;
}

type Element = { type: unknown; props: Record<string, unknown> };
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const element = value as Element;
  return [element, ...nodes(element.props.children)];
}
function text(value: unknown): string {
  if (Array.isArray(value)) return value.map(text).join("");
  if (typeof value === "string") return value;
  return nodes(value).filter(n => typeof n.props.children === "string").map(n => n.props.children).join(" ");
}
function click(element: Element, event = "onClick") {
  assert.equal(typeof element.props[event], "function");
  (element.props[event] as () => void)();
}

const reservation: AdminComplementaryReservation = {
  id: "resource-id", reservationId: "b7700000-0000-4000-8000-000000000001", seriesId: "series",
  optionId: "option", customerName: "Teste", customerWhatsapp: "53999990001",
  reservationDate: "2026-10-03", startTime: null, endTime: null,
  occupancyMode: "day", status: "scheduled", groupName: "Complementar", optionName: "Espaço",
};

function details(seriesId: string | null, error = false) {
  const states: unknown[] = [];
  let cursor = 0;
  let pending: Promise<void> | undefined;
  const calls: unknown[][] = [];
  const successes: unknown[][] = [];
  const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
  const result = error ? { ok: false, message: "Não foi possível cancelar." } : { ok: true, data: {}, message: "Cancelado." };
  const { ComplementaryReservationDetails } = load<{ ComplementaryReservationDetails: (props: unknown) => unknown }>(
    "src/components/admin/complementary-reservation-details.tsx", {
      react: {
        useState: (initial: unknown) => { const index = cursor++; if (!(index in states)) states[index] = initial; return [states[index], (value: unknown) => { states[index] = value; }]; },
        useTransition: () => [false, (fn: () => Promise<void>) => { pending = fn(); }],
      },
      "react/jsx-runtime": { jsx, jsxs: jsx },
      "lucide-react": { Ban: "Ban", CalendarDays: "CalendarDays", Clock3: "Clock3", LoaderCircle: "LoaderCircle" },
      "@/components/admin/booking-payment": { BookingPayment: "BookingPayment" },
      "@/components/admin/status-badge": { StatusBadge: "StatusBadge" },
      "@/components/ui/button": { Button: "Button" }, "@/components/ui/modal": { Modal: "Modal" },
      "@/lib/date": { formatLongDate: (date: string) => date },
      "@/app/admin/agenda/actions": {
        cancelComplementarySeriesOccurrence: async (...args: unknown[]) => { calls.push(["series", ...args]); return result; },
        cancelComplementaryReservation: async (...args: unknown[]) => { calls.push(["one-off", ...args]); return result; },
      },
    },
  );
  return {
    calls, successes, finish: async () => pending,
    render: () => {
      cursor = 0;
      return nodes(ComplementaryReservationDetails({ reservation: { ...reservation, seriesId }, onClose() {}, onCancelled: (...args: unknown[]) => successes.push(args) }));
    },
  };
}
function cancelButton(elements: Element[]) {
  const button = elements.find(n => n.type === "Button" && text(n.props.children).includes("Cancelar reserva"));
  assert.ok(button);
  return button;
}

test("series details confirm single by default and offer future with explicit consequence", async () => {
  for (const scope of ["single", "future"]) {
    const ui = details("series");
    click(cancelButton(ui.render()));
    const rendered = ui.render();
    const radios = rendered.filter(n => n.type === "input" && n.props.type === "radio");
    assert.equal(radios.length, 2);
    assert.equal(radios.find(n => n.props.value === "single")?.props.checked, true);
    if (scope === "future") click(radios.find(n => n.props.value === scope)!, "onChange");
    assert.match(text(ui.render()), scope === "future" ? /série será encerrada/ : /outras ocorrências continuam/);
    click(cancelButton(ui.render()));
    await ui.finish();
    assert.deepEqual(ui.calls, [["series", reservation.reservationId, reservation.reservationDate, scope]]);
    assert.equal(ui.successes.length, 1);
  }
});

test("one-off details never show series choices and keep resource cancellation", async () => {
  const ui = details(null);
  click(cancelButton(ui.render()));
  assert.equal(ui.render().filter(n => n.props.type === "radio").length, 0);
  click(cancelButton(ui.render()));
  await ui.finish();
  assert.deepEqual(ui.calls, [["one-off", reservation.id, reservation.reservationDate]]);
});

test("failed cancellation announces error and does not report success", async () => {
  const ui = details("series", true);
  click(cancelButton(ui.render()));
  click(cancelButton(ui.render()));
  await ui.finish();
  assert.equal(ui.successes.length, 0);
  assert.ok(ui.render().some(n => n.props.role === "status" && text(n.props.children).includes("Não foi possível cancelar")));
});

test("server action resolves current business, validates scope and refreshes the calendar", async () => {
  const calls: unknown[][] = [];
  const calendar = { appointments: [] };
  const actions = load<typeof import("../app/admin/agenda/actions")>("src/app/admin/agenda/actions.ts", {
    "@/lib/repositories/daily-calendar": { readDailyCalendar: async (...args: unknown[]) => { calls.push(["calendar", ...args]); return calendar; } },
    "next/cache": { revalidatePath() {} },
    "@/lib/availability": {}, "@/lib/date": {}, "@/lib/repositories/appointments": {},
    "@/lib/repositories/businesses": { requireCurrentBusiness: async () => ({ id: "server-business" }) },
    "@/lib/repositories/admin-reservations": { cancelAdminReservationSeries: async (...args: unknown[]) => { calls.push(["cancel", ...args]); return null; } },
  });
  const result = await actions.cancelComplementarySeriesOccurrence(reservation.reservationId, reservation.reservationDate, "future");
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [["cancel", "server-business", reservation.reservationId, "future"], ["calendar", "server-business", reservation.reservationDate]]);
  calls.length = 0;
  assert.equal((await actions.cancelComplementarySeriesOccurrence("invalid", reservation.reservationDate, "single")).ok, false);
  assert.equal((await actions.cancelComplementarySeriesOccurrence(reservation.reservationId, reservation.reservationDate, "all" as "single")).ok, false);
  assert.equal(calls.length, 0);
});
