import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyBusinessForm, normalizeOptionalUrl, normalizeSlug, normalizeVisualTheme, slugCandidate, toOnboardingPayload, validateBusinessContact, validateDuration, validateSlug } from "./business-form";

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
  assert.match(validateDuration("group_2", 60, [null]) ?? "", /Grupo 2/);
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
  assert.equal(payload.hours.length, 7);
});
