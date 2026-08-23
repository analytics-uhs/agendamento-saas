import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

test("Badge mantém a variante visual separada da regra de negócio", () => {
  const html = renderToStaticMarkup(
    createElement(Badge, { variant: "success" }, "Concluído"),
  );

  assert.match(html, /bg-success\/10/);
  assert.match(html, />Concluído</);
});

test("Card preserva o elemento semântico escolhido", () => {
  const html = renderToStaticMarkup(
    createElement(Card, { as: "section", padding: "md" }, "Conteúdo"),
  );

  assert.match(html, /^<section/);
  assert.match(html, /p-4 sm:p-5/);
});

test("PageHeader aceita ação e EmptyState permanece acessível por composição", () => {
  const header = renderToStaticMarkup(
    createElement(PageHeader, {
      title: "Agenda",
      description: "Gerencie seus horários.",
      action: createElement("button", { "aria-label": "Novo agendamento" }, "+"),
    }),
  );
  const empty = renderToStaticMarkup(
    createElement(EmptyState, { role: "status" }, "Nenhum agendamento."),
  );

  assert.match(header, /<h1/);
  assert.match(header, /aria-label="Novo agendamento"/);
  assert.match(empty, /role="status"/);
});
