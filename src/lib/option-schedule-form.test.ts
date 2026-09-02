import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { OptionScheduleEditor } from "@/components/admin/option-schedule-editor";
import { BookingGroupEditor } from "@/components/booking-group-editor";
import { initialOptionScheduleHours, optionScheduleDays, optionScheduleError, optionSchedulePayload, optionScheduleSuccess, validateOptionSchedule } from "./option-schedule-form";
import type { BusinessGroupForm } from "@/types/business";

const business = [{ weekday: 1, active: true, start_time: "17:00:00", end_time: "23:00:00" }];
const custom = [{ weekday: 1, active: true, start_time: "18:15:00", end_time: "23:15:00" }];
const days = () => optionScheduleDays(custom);
const save = async () => ({ ok: true as const, message: "Salvo" });

test("business mostra modo herdado e não renderiza editor semanal", () => {
  const html = renderToStaticMarkup(createElement(OptionScheduleEditor, { initial: { name: "Opção A", mode: "business", hours: days() }, onSave: save }));
  assert.match(html, /Usa os mesmos horários definidos para o estabelecimento/);
  assert.doesNotMatch(html, /type="time"/);
});

test("custom renderiza os sete dias e inputs acessíveis de minuto", () => {
  const html = renderToStaticMarkup(createElement(OptionScheduleEditor, { initial: { name: "Opção A", mode: "custom", hours: days() }, onSave: save }));
  assert.match(html, /value="18:15"/);
  assert.match(html, /aria-label="Início de Segunda/);
  assert.equal((html.match(/role="switch"/g) ?? []).length, 7);
  assert.match(html, /Fechado/);
  assert.match(html, /sm:flex-row/);
  assert.match(html, /col-span-2 sm:col-span-1/);
});

test("primeiro business → custom copia visualmente horários gerais sem mutar origem", () => {
  const draft = initialOptionScheduleHours("business", [], business);
  assert.equal(draft[1].windows[0].startTime, "17:00");
  draft[1].windows[0].startTime = "18:30";
  assert.equal(business[0].start_time, "17:00:00");
});

test("custom → business envia somente modo e preserva draft ao voltar", () => {
  const draft = days();
  assert.deepEqual(optionSchedulePayload("id", "business", draft), { p_option_id: "id", p_schedule_mode: "business" });
  assert.equal(draft[1].windows[0].startTime, "18:15");
  assert.deepEqual(initialOptionScheduleHours("business", custom, business), draft);
  assert.deepEqual(initialOptionScheduleHours("custom", custom, business), draft);
});

test("custom vazio é fechado, nunca herda; payload contém os sete weekdays", () => {
  const closed = initialOptionScheduleHours("custom", [], business);
  assert.equal(closed.filter((day) => day.active).length, 0);
  assert.deepEqual(optionSchedulePayload("id", "custom", closed).p_hours,
    Array.from({ length: 7 }, (_, weekday) => ({ weekday, windows: [] })));
  assert.equal(validateOptionSchedule("custom", closed), null);
});

test("múltiplas janelas são ordenadas e :15/:30 são mantidos no contrato RPC", () => {
  const draft = days();
  draft[1].windows = [{ startTime: "14:30", endTime: "18:30" }, { startTime: "08:15", endTime: "11:15" }];
  assert.equal(validateOptionSchedule("custom", draft), null);
  assert.deepEqual((optionSchedulePayload("id", "custom", draft).p_hours as { weekday: number; windows: unknown[] }[])[1], {
    weekday: 1, windows: [{ start_time: "08:15", end_time: "11:15" }, { start_time: "14:30", end_time: "18:30" }],
  });
});

test("dia desativado envia windows vazio sem apagar o draft", () => {
  const draft = days(); draft[1].active = false;
  assert.deepEqual((optionSchedulePayload("id", "custom", draft).p_hours as { windows: unknown[] }[])[1].windows, []);
  assert.equal(draft[1].windows.length, 1);
});

test("minutos :45 são aceitos sem arredondamento", () => {
  const draft = days(); draft[1].windows = [{ startTime: "18:45", endTime: "23:45" }];
  assert.equal(validateOptionSchedule("custom", draft), null);
  assert.match(JSON.stringify(optionSchedulePayload("id", "custom", draft)), /18:45/);
});

test("meia-noite do banco aparece como 00:00 e é válida no formulário", () => {
  const draft = optionScheduleDays([{ ...custom[0], end_time: "24:00:00" }]);
  assert.equal(draft[1].windows[0].endTime, "00:00");
  assert.equal(validateOptionSchedule("custom", draft), null);
});

test("validação rejeita overlap, duplicata, formato inválido e duração zero", () => {
  for (const windows of [
    [{ startTime: "08:15", endTime: "12:15" }, { startTime: "11:15", endTime: "14:15" }],
    [{ startTime: "08:15", endTime: "12:15" }, { startTime: "08:15", endTime: "12:15" }],
    [{ startTime: "17:00", endTime: "17:00" }],
    [{ startTime: "99:00", endTime: "23:00" }],
  ]) {
    const draft = days(); draft[1].windows = windows;
    assert.ok(validateOptionSchedule("custom", draft));
  }
});

test("valida shape/weekday/modo e aceita períodos adjacentes", () => {
  for (const input of [null, [], [...days().slice(1), days()[1]], days().map((day) => ({ ...day, weekday: 7 })), days().map((day) => ({ ...day, windows: [null] }))]) {
    assert.ok(validateOptionSchedule("custom", input));
  }
  assert.ok(validateOptionSchedule("invalid", days()));
  const draft = days(); draft[1].windows = [{ startTime: "08:15", endTime: "11:15" }, { startTime: "11:15", endTime: "12:15" }];
  assert.equal(validateOptionSchedule("custom", draft), null);
});

test("mensagens de sucesso e erros não expõem detalhes técnicos", () => {
  assert.equal(optionScheduleSuccess("Opção A"), "Horários de Opção A atualizados.");
  assert.match(optionScheduleError("23P01"), /sobrepor/);
  assert.match(optionScheduleError("42501"), /não está disponível/);
  assert.match(optionScheduleError(), /alterações foram mantidas/);
});

test("somente Grupo principal recebe a configuração de horários", () => {
  const base: BusinessGroupForm = { position: 1, label: "Escolha", active: true, required: true, intentName: "", occupancyMode: null, options: [{ id: "id", name: "Opção A", durationMinutes: null }] };
  for (const position of [1, 2, 3] as const) {
    const html = renderToStaticMarkup(createElement(BookingGroupEditor, { group: { ...base, position }, onChange() {}, renderOptionSchedule: () => createElement("div", null, "CONFIGURAÇÃO ESPECÍFICA") }));
    assert.equal(html.includes("CONFIGURAÇÃO ESPECÍFICA"), position === 1);
  }
});

test("salvamento usa RPC existente e tenant da sessão, sem writes diretos", () => {
  const repository = readFileSync("src/lib/repositories/option-schedules.ts", "utf8");
  const action = readFileSync("src/app/admin/option-schedule-actions.ts", "utf8");
  assert.match(repository, /rpc\("set_admin_booking_option_schedule", optionSchedulePayload/);
  assert.match(repository, /eq\("business_id", businessId\)/);
  assert.match(repository, /bookingGroupPosition\("primary"\)/);
  assert.doesNotMatch(repository, /\.(insert|update|delete)\(/);
  assert.match(action, /requireCurrentBusiness\(\)/);
  assert.match(action, /validateOptionSchedule\(mode, hours\)/);
});
