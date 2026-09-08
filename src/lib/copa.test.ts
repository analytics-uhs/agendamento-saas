import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "lucide-react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { PageHeader } from "../components/ui/page-header";
import { EmptyState } from "../components/ui/empty-state";
import * as field from "../components/ui/field";
import * as copa from "./copa";
import * as sales from "./sales";
import * as catalog from "./product-catalog";
import { getAdminNavigation } from "./admin-navigation-items";

function load<T>(path: string, dependencies: Record<string, unknown>): T {
  const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  runInNewContext(code, { exports, crypto: { randomUUID: () => "ce690000-0000-4000-8000-000000000001" }, require: (id: string) => {
    if (id === "server-only") return {};
    if (!(id in dependencies)) throw Error(`Unexpected import ${id}`);
    return dependencies[id];
  } });
  return exports as T;
}
const sale: copa.CopaSale = { id: "ce690000-0000-4000-8000-000000000001", sale_type: "tab", tab_name: "João", status: "draft", revision: 2, updated_at: "2026-09-07", created_at: "2026-09-07", completed_at: null, customer_name: null, payment_method: null, total_amount: 10, item_count: 1 };
const product: catalog.Product = { id: "de690000-0000-4000-8000-000000000001", name: "Água", unit: "UN", sale_price: 99, cost_price: null, category_id: null, active: true, minimum_stock: 0, sku: "AGUA", barcode: "123" };
const items: sales.SaleItem[] = [{ id: "item", product_id: product.id, quantity: 2, unit_price: 5, product }];
const dependencies = {
  react: React, "react/jsx-runtime": jsx, "lucide-react": icons,
  "next/link": { default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => React.createElement("a", props, children) },
  "next/navigation": { useRouter: () => ({ push() {}, replace() {}, refresh() {} }) },
  "@/app/admin/copa/actions": {}, "@/components/ui/card": { Card }, "@/components/ui/button": { Button },
  "@/components/ui/page-header": { PageHeader }, "@/components/ui/empty-state": { EmptyState }, "@/components/ui/field": field,
  "@/lib/copa": copa, "@/lib/sales": sales, "@/lib/product-catalog": catalog,
};

test("Copa quantities and totals preserve the saved price, not today's price", () => {
  assert.equal(copa.copaTotal(items), 10);
  for (const value of [-1, 1.5, NaN, Infinity, "1"]) assert.throws(() => copa.copaQuantity(value));
  assert.equal(copa.copaQuantity(0), 0);
  assert.equal(copa.copaTitle(sale), "Comanda João");
});

test("Copa home renders open tabs, recent sales, history and empty states", () => {
  const { CopaHome } = load<{ CopaHome: React.ComponentType<{ tabs: copa.CopaSale[]; recent: copa.CopaSale[] }> }>("src/components/admin/copa-home.tsx", dependencies);
  const html = renderToStaticMarkup(React.createElement(CopaHome, { tabs: [sale], recent: [{ ...sale, status: "completed", payment_method: "pix" }] }));
  assert.match(html, /Abrir comanda/); assert.match(html, /Venda rápida/); assert.match(html, /João/); assert.match(html, /Pix/);
  assert.match(html, /\/admin\/copa\/comandas\//); assert.match(html, /Ver histórico/);
  const empty = renderToStaticMarkup(React.createElement(CopaHome, { tabs: [], recent: [] }));
  assert.match(empty, /Nenhuma comanda aberta/); assert.match(empty, /Nenhuma venda finalizada/);
});

test("both Copa flows share touch controls and the existing snapshot total", () => {
  const { CopaEditor } = load<{ CopaEditor: React.ComponentType<{ sale: copa.CopaSale | null; items: sales.SaleItem[]; products: catalog.Product[] }> }>("src/components/admin/copa-editor.tsx", dependencies);
  const html = renderToStaticMarkup(React.createElement(CopaEditor, { sale, items, products: [product] }));
  assert.match(html, /Fechar comanda/); assert.match(html, /Diminuir Água/); assert.match(html, /Aumentar Água/); assert.match(html, /Remover Água/);
  assert.match(html, /10,00/); assert.match(html, /5,00/);
  const quick = renderToStaticMarkup(React.createElement(CopaEditor, { sale: null, items: [], products: [] }));
  assert.match(quick, /Venda rápida/); assert.match(quick, /Selecione um produto para começar/);
});

test("Copa server mutations bind current business, gate management, and send one operation", async () => {
  let allowed = true; const calls: unknown[] = [];
  const repo = load<{
    openCopa(id: string, type: copa.CopaType, name: string): Promise<{ ok: boolean }>;
    mutateCopa(id: string, type: copa.CopaType, revision: number, input: { product: string; quantity: number } | { payment: string }): Promise<{ ok: boolean }>;
  }>("src/lib/repositories/copa.ts", {
    "@/lib/auth/business-module": { requireBusinessModule: async (module: string) => { assert.equal(module, "management"); if (!allowed) throw Error("DENIED"); return { id: "CURRENT-B" }; } },
    "@/lib/supabase/server": { createClient: async () => ({ rpc: async (name: string, args: unknown) => { calls.push([name, args]); return { data: sale.id, error: null }; } }) },
    "@/lib/repositories/sales": {}, "@/lib/product-catalog": catalog, "@/lib/copa": copa, "@/lib/sales": sales,
  });
  assert.equal((await repo.openCopa(sale.id, "tab", "João")).ok, true);
  assert.equal((await repo.mutateCopa(sale.id, "tab", 2, { product: product.id, quantity: 3 })).ok, true);
  assert.equal((await repo.mutateCopa(sale.id, "tab", 3, { payment: "pix" })).ok, true);
  assert.equal(JSON.stringify(calls[2]), JSON.stringify(["complete_admin_copa_sale", { p_business_id: "CURRENT-B", p_sale_id: sale.id, p_sale_type: "tab", p_revision: 3, p_payment_method: "pix" }]));
  assert.equal((await repo.mutateCopa(sale.id, "tab", 3, { product: product.id, quantity: 1.5 })).ok, false);
  assert.equal(calls.length, 3);
  allowed = false;
  await assert.rejects(repo.openCopa(sale.id, "tab", "João"), /DENIED/);
});

test("Copa replaces competing navigation and preserves PDV/history/fiscal links", () => {
  const menu = getAdminNavigation({ scheduling: true, management: true, fiscal: true }, false);
  assert.equal(menu.filter(item => item.href === "/admin/copa").length, 1);
  assert.ok(!menu.some(item => ["/admin/pdv", "/admin/vendas"].includes(item.href)));
  assert.equal(menu.find(item => item.href === "/admin/compras")?.label, "Entradas");
  assert.match(readFileSync("src/app/admin/pdv/page.tsx", "utf8"), /redirect\("\/admin\/copa\/venda-rapida"\)/);
  assert.match(readFileSync("src/app/admin/vendas/[id]/page.tsx", "utf8"), /SaleFiscal/);
  const productForm = readFileSync("src/components/admin/product-catalog.tsx", "utf8");
  assert.match(productForm, /Mais opções/); assert.doesNotMatch(productForm, /<Select id="product-unit"/);
  assert.match(readFileSync("src/app/admin/compras/page.tsx", "utf8"), /title="Entradas"/);
});

test("real shared editor wires increment, quick opening and a single payment action", async () => {
  let running: Promise<unknown> = Promise.resolve();
  let stateIndex = 0;
  let paying = false;
  const calls: unknown[] = [];
  const nodes = (value: React.ReactNode): React.ReactElement<Record<string, unknown>>[] => {
    if (Array.isArray(value)) return value.flatMap(nodes);
    if (!React.isValidElement<Record<string, unknown>>(value)) return [];
    return [value, ...nodes(value.props.children as React.ReactNode)];
  };
  const mockReact = {
    ...React,
    useRef: (value: unknown) => ({ current: value }),
    useState: () => { const values = ["", "", paying, "pix"]; return [values[stateIndex++], () => {}]; },
    useTransition: () => [false, (fn: () => Promise<unknown>) => { running = fn(); }],
    useOptimistic: (value: unknown) => [value, () => {}],
  };
  const actions = {
    openCopaSale: async (...args: unknown[]) => { calls.push(["open", ...args]); return { ok: true, data: { id: sale.id } }; },
    updateCopaSale: async (...args: unknown[]) => { calls.push(["update", ...args]); return { ok: true }; },
  };
  const { CopaEditor } = load<{ CopaEditor: (props: { sale: copa.CopaSale | null; items: sales.SaleItem[]; products: catalog.Product[] }) => React.ReactElement }>("src/components/admin/copa-editor.tsx", { ...dependencies, react: mockReact, "@/app/admin/copa/actions": actions });
  let tree = nodes(CopaEditor({ sale, items, products: [product] }));
  (tree.find(node => node.props["aria-label"] === "Aumentar Água")!.props.onClick as () => void)();
  await running;
  assert.equal(JSON.stringify(calls[0]), JSON.stringify(["update", sale.id, "tab", 2, { product: product.id, quantity: 3 }]));
  stateIndex = 0; paying = true;
  tree = nodes(CopaEditor({ sale, items, products: [product] }));
  (tree.find(node => node.type === "form")!.props.onSubmit as (event: { preventDefault(): void }) => void)({ preventDefault() {} });
  await running;
  assert.equal(JSON.stringify(calls[1]), JSON.stringify(["update", sale.id, "tab", 2, { payment: "pix" }]));
  stateIndex = 0; paying = false;
  tree = nodes(CopaEditor({ sale: null, items: [], products: [product] }));
  (tree.find(node => node.type === Button && node.props.variant === "outline")!.props.onClick as () => void)();
  await running;
  assert.equal(JSON.stringify(calls.slice(2)), JSON.stringify([
    ["open", sale.id, "quick", ""], ["update", sale.id, "quick", 0, { product: product.id, quantity: 1 }],
  ]));
});
