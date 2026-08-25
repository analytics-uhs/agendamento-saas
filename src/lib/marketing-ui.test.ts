import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../../", import.meta.url);
const componentPath = new URL("src/components/marketing/marketing-landing.tsx", projectRoot);
const stylesPath = new URL("src/components/marketing/marketing-landing.css", projectRoot);

test("mantém CTA, navegação e FAQ acessíveis na landing", async () => {
  const source = await readFile(componentPath, "utf8");

  assert.match(source, /href=\{MARKETING_TRIAL_HREF\}/);
  assert.match(source, /id="como-funciona"/);
  assert.match(source, /id="recursos"/);
  assert.match(source, /id="preco"/);
  assert.match(source, /aria-expanded=\{open\}/);
  assert.match(source, /aria-controls=\{answerId\}/);
  assert.match(source, /Começar 15 dias grátis sem cartão/);
  assert.doesNotMatch(source, /Começar meus 15 dias grátis/);
  assert.doesNotMatch(source, />15 dias grátis · Sem cartão</);
  assert.match(source, /Lote Fundadores esgotado/);
});

test("recebe os agregados da oferta sem manter números de vagas no JSX", async () => {
  const source = await readFile(componentPath, "utf8");

  assert.match(source, /founderOffer\.occupiedSpots/);
  assert.match(source, /founderOffer\.availableSpots/);
  assert.match(source, /founderOffer\.occupiedPercentage/);
  assert.doesNotMatch(source, /38 de 50/);
  assert.doesNotMatch(source, /12 vagas disponíveis/);
});

test("reutiliza o logo real e mantém o crédito acessível no rodapé", async () => {
  const source = await readFile(componentPath, "utf8");

  assert.match(source, /"\/brand\/agendafacil-logo-escuro\.png"/);
  assert.match(source, /"\/brand\/agendafacil-logo-claro\.png"/);
  assert.doesNotMatch(source, /@\/app\/icon\.png/);
  assert.match(source, /<Brand priority \/>/);
  assert.match(source, /<Brand variant="light" \/>/);
  assert.match(source, /alt="AgendaFácil"/);
  assert.match(source, /href="https:\/\/www\.uhsanalytics\.com\.br\/"/);
  assert.match(source, /target="_blank"/);
  assert.match(source, /rel="noopener noreferrer"/);
  assert.match(source, /© 2026 AgendaFácil\. Todos os direitos reservados\./);
});

test("limpa timers e observers da demonstração automática", async () => {
  const source = await readFile(componentPath, "utf8");

  assert.match(source, /window\.setInterval/);
  assert.match(source, /window\.clearInterval\(timer\)/);
  assert.match(source, /observer\.disconnect\(\)/);
  assert.match(source, /media\.removeEventListener\("change", updateMotion\)/);
});

test("oferece fallback visual completo para movimento reduzido", async () => {
  const styles = await readFile(stylesPath, "utf8");

  assert.match(styles, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(styles, /animation:\s*none\s*!important/);
  assert.match(styles, /transition-duration:\s*\.01ms\s*!important/);
});
