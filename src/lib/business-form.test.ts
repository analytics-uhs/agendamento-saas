import assert from "node:assert/strict";
import test from "node:test";
import { cloneBusinessHourWindows, createEmptyBusinessForm, nextBusinessHourWindow, normalizeOptionalUrl, normalizeSlug, normalizeVisualTheme, slugCandidate, toOnboardingPayload, validateBusinessContact, validateBusinessGroups, validateBusinessHours, validateDuration, validateSlug } from "./business-form";

test("normaliza slug com espaços, acentos e caixa alta", () => {
  assert.equal(normalizeSlug("  Clínica São João  "), "clinica-sao-joao");
  assert.equal(normalizeSlug("Arena___Central"), "arena-central");
});

test("gera o slug pelo nome completo e sugere sufixos previsíveis", () => {
  assert.equal(normalizeSlug("Arena Central Futevôlei"), "arena-central-futevolei");
  assert.equal(slugCandidate("Arena Central", 1), "arena-central");
  assert.equal(slugCandidate("Arena Central", 2), "arena-central-2");
  assert.equal(slugCandidate("a".repeat(80), 20).length, 80);
});

test("normaliza apenas URLs HTTP(S) seguras e aceita campos vazios", () => {
  assert.equal(normalizeOptionalUrl(""), null);
  assert.equal(normalizeOptionalUrl("instagram.com/arena"), "https://instagram.com/arena");
  assert.equal(normalizeOptionalUrl("javascript:alert(1)"), null);
  assert.equal(normalizeOptionalUrl("data:text/html,teste"), null);
  assert.equal(validateBusinessContact({ address: "", googleMapsUrl: "", instagramUrl: "", facebookUrl: "" }), null);
  assert.match(validateBusinessContact({ address: "", googleMapsUrl: "javascript:alert(1)", instagramUrl: "", facebookUrl: "" }) ?? "", /HTTP ou HTTPS/);
});

test("normaliza preferência legada de sistema para tema claro", () => {
  assert.equal(normalizeVisualTheme("system"), "light");
  assert.equal(normalizeVisualTheme("dark"), "dark");
});

test("valida slug obrigatório e comprimento mínimo", () => {
  assert.equal(validateSlug(""), "Informe uma URL personalizada.");
  assert.equal(validateSlug("ab"), "A URL deve ter entre 3 e 80 caracteres.");
  assert.equal(validateSlug("Arena Central"), null);
});

test("aceita somente os três modos de duração", () => {
  assert.equal(validateDuration("fixed", 60, []), null);
  assert.equal(validateDuration("fixed_multiple", 30, []), null);
  assert.equal(validateDuration("group_2", 60, [30, 45]), null);
  assert.equal(validateDuration("group_1" as never, 60, []), "Modo de duração inválido.");
  assert.match(validateDuration("group_2", 60, [null]) ?? "", /Grupo secundário/);
});

test("transforma formulário em payload persistível e preserva a ordem", () => {
  const form = createEmptyBusinessForm();
  form.name = " Arena Central ";
  form.slug = "Arena Central";
  form.durationMode = "group_2";
  form.address = " Rua Central, 100 ";
  form.instagramUrl = "instagram.com/arena-central";
  form.groups[0].label = "Quadra";
  form.groups[0].options = [{ name: "Quadra 2", durationMinutes: 90 }, { name: "Quadra 1", durationMinutes: 30 }];
  form.groups[1].label = "Esporte";
  form.groups[1].options = [{ name: "Futevôlei", durationMinutes: 60 }];

  const payload = toOnboardingPayload(form);
  assert.equal(payload.name, "Arena Central");
  assert.equal(payload.slug, "arena-central");
  assert.equal(payload.settings.duration_mode, "group_2");
  assert.equal(payload.address, "Rua Central, 100");
  assert.equal(payload.instagram_url, "https://instagram.com/arena-central");
  assert.equal(payload.settings.allow_multiple_blocks, false);
  assert.deepEqual(payload.groups[0].options.map((option) => option.sort_order), [0, 1]);
  assert.deepEqual(payload.groups[0].options.map((option) => option.duration_minutes), [null, null]);
  assert.equal(payload.groups[1].options[0].duration_minutes, 60);
  assert.equal(payload.groups.length, 2);
  assert.equal(payload.hours.length, 7);
  assert.equal(payload.hours[1].windows.length, 1);
});

test("mantém o Grupo complementar ausente por padrão para payloads legados", () => {
  const form = createEmptyBusinessForm();
  form.groups[0].options = [{ name: "Opção principal", durationMinutes: null }];
  form.groups[1].options = [{ name: "Opção secundária", durationMinutes: null }];
  assert.equal(form.groups[2].active, false);
  assert.equal(validateBusinessGroups(form.groups), null);
  assert.deepEqual(toOnboardingPayload(form).groups.map((group) => group.position), [1, 2]);
});

test("serializa Grupo complementar por dia e por horário", () => {
  const form = createEmptyBusinessForm();
  form.groups[0].options = [{ name: "Opção principal", durationMinutes: null }];
  form.groups[1].options = [{ name: "Opção secundária", durationMinutes: null }];
  const complementary = form.groups[2];
  complementary.active = true;
  complementary.label = "Espaços adicionais";
  complementary.intentName = "Espaço";
  complementary.occupancyMode = "day";
  complementary.options = [{ name: "Sala de apoio", durationMinutes: null }];

  assert.equal(validateBusinessGroups(form.groups), null);
  let payloadGroup = toOnboardingPayload(form).groups[2];
  assert.equal(payloadGroup.position, 3);
  assert.equal(payloadGroup.intent_name, "Espaço");
  assert.equal(payloadGroup.occupancy_mode, "day");
  assert.equal(payloadGroup.required, false);

  complementary.occupancyMode = "time_slot";
  payloadGroup = toOnboardingPayload(form).groups[2];
  assert.equal(payloadGroup.occupancy_mode, "time_slot");
});

test("Grupo complementar ativo exige modo de ocupação e opção válida", () => {
  const form = createEmptyBusinessForm();
  form.groups[0].options = [{ name: "Opção principal", durationMinutes: null }];
  form.groups[1].options = [{ name: "Opção secundária", durationMinutes: null }];
  const complementary = form.groups[2];
  complementary.active = true;
  complementary.occupancyMode = null;
  assert.match(validateBusinessGroups(form.groups) ?? "", /ocupa a agenda/);

  complementary.occupancyMode = "day";
  assert.match(validateBusinessGroups(form.groups) ?? "", /ao menos uma opção/);
  complementary.options = [{ name: "", durationMinutes: null }];
  assert.match(validateBusinessGroups(form.groups) ?? "", /Preencha todas as opções/);
});

test("valida janelas adjacentes e rejeita sobreposição", () => {
  const hours = createEmptyBusinessForm().hours;
  hours[1].windows = [{ startTime: "08:00", endTime: "11:00" }, { startTime: "11:00", endTime: "14:00" }];
  assert.equal(validateBusinessHours(hours), null);
  hours[1].windows[1].startTime = "10:30";
  assert.match(validateBusinessHours(hours) ?? "", /não podem se sobrepor/);
});

test("copia todas as janelas sem compartilhar referências", () => {
  const monday = [{ startTime: "08:00", endTime: "11:00" }, { startTime: "14:00", endTime: "20:00" }];
  const copied = cloneBusinessHourWindows(monday);
  copied[0].startTime = "09:00";
  assert.equal(monday[0].startTime, "08:00");
  assert.deepEqual(copied[1], monday[1]);
});

test("sugere novo período sem sobrepor os existentes", () => {
  assert.deepEqual(nextBusinessHourWindow([{ startTime: "08:00", endTime: "11:00" }, { startTime: "14:00", endTime: "20:00" }]), { startTime: "11:00", endTime: "12:00" });
  assert.deepEqual(nextBusinessHourWindow([]), { startTime: "08:00", endTime: "18:00" });
});

test("valida funcionamento terminando à meia-noite sem permitir madrugada", () => {
  const hours = createEmptyBusinessForm().hours;
  hours[1].windows = [{ startTime: "17:00", endTime: "00:00" }];
  assert.equal(validateBusinessHours(hours), null);
  hours[1].windows = [{ startTime: "00:00", endTime: "06:00" }];
  assert.equal(validateBusinessHours(hours), null);
  hours[1].windows = [{ startTime: "17:00", endTime: "17:00" }];
  assert.equal(validateBusinessHours(hours), "O horário final deve ser posterior ao inicial.");
  hours[1].windows = [{ startTime: "22:00", endTime: "02:00" }];
  assert.equal(validateBusinessHours(hours), "O horário final deve ser posterior ao inicial.");
});

test("sugere o último período do dia como 23:00 até 00:00", () => {
  assert.deepEqual(
    nextBusinessHourWindow([{ startTime: "08:00", endTime: "23:00" }]),
    { startTime: "23:00", endTime: "00:00" },
  );
});
