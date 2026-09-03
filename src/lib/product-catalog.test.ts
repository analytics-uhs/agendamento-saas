import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as catalog from "./product-catalog";

const tenant = "bc600000-0000-4000-8000-000000000001";
const productId = "dc600000-0000-4000-8000-000000000001";
const input = { ...catalog.emptyProduct, name: " Água ", sku: " agua-500 ", barcode: "00789", sale_price: "8,00", cost_price: "4.50", minimum_stock: "10,125" };

test("decimal parser accepts BR comma/dot without rounding or loss of zeroes", () => {
  assert.equal(catalog.parseCatalogDecimal("4,50"), "4.50");
  assert.equal(catalog.parseCatalogDecimal("4.50"), "4.50");
  assert.equal(catalog.parseCatalogDecimal("0008"), "8.00");
  assert.equal(catalog.parseCatalogDecimal("0"), "0.00");
  assert.equal(catalog.parseCatalogDecimal("10,125", 3), "10.125");
  assert.equal(catalog.parseCatalogDecimal("", 2, true), null);
  assert.equal(catalog.parseCatalogDecimal("9999999999,99"), "9999999999.99");
  for (const bad of ["-1", "1e3", "NaN", "Infinity", "4.501", "1.234,56", "1,234.56", "10000000000", "", null, 4.5]) assert.throws(() => catalog.parseCatalogDecimal(bad));
  assert.match(catalog.formatCatalogBRL("4.50"), /R\$\s4,50/);
});

test("server parser allowlists fields, units and identifiers; catalog has no stock balance", () => {
  const values = catalog.parseProductInput({ ...input, business_id: "spoof", stock_quantity: 99 });
  assert.equal(values.name, "Água"); assert.equal(values.sku, "AGUA-500"); assert.equal(values.barcode, "00789");
  assert.equal(values.sale_price, "8.00"); assert.equal(values.minimum_stock, "10.125");
  assert.ok(!("business_id" in values)); assert.ok(!("stock_quantity" in values));
  for (const unit of Object.keys(catalog.PRODUCT_UNITS)) assert.equal(catalog.parseProductInput({ ...input, unit }).unit, unit);
  for (const patch of [{ name: " " }, { name: "x".repeat(161) }, { unit: "constructor" }, { category_id: "bad" }, { barcode: "123 45" }, { sku: "x".repeat(65) }, { active: "true" }, { sale_price: "-1" }, { minimum_stock: "-1" }]) assert.throws(() => catalog.parseProductInput({ ...input, ...patch }));
  assert.deepEqual(catalog.parseCategoryInput({ name: " Bebidas ", active: false }), { name: "Bebidas", active: false });
  assert.throws(() => catalog.parseCategoryInput({ name: "", active: true }));
});

test("editing preserves decimal values and inactive status", () => {
  const product: catalog.Product = { id: productId, ...catalog.parseProductInput(input), active: false };
  const draft = catalog.productToInput(product);
  assert.deepEqual(catalog.parseProductInput(draft), { ...catalog.parseProductInput(input), active: false });
});

function repositoryHarness() {
  const calls: [string, ...unknown[]][] = [];
  let allowed = true;
  let dbError: null | { code: string } = null;
  let result: unknown = { id: productId, ...catalog.parseProductInput(input) };
  let table = "";
  const query = new Proxy({}, { get(_target, method: string) {
    if (method === "then") return (resolve: (value: unknown) => void) => resolve({ data: table === "product_categories" ? [] : [result], count: 1, error: dbError });
    return (...args: unknown[]) => {
      calls.push([method, ...args]);
      if (method === "maybeSingle") return Promise.resolve({ data: result, error: dbError });
      return query;
    };
  } });
  const dependencies: Record<string, unknown> = {
    "server-only": {},
    "@/lib/product-catalog": catalog,
    "@/lib/auth/business-module": { requireBusinessModule: async (name: string) => { calls.push(["guard", name]); if (!allowed) throw new Error("NOT_FOUND"); return { id: tenant }; } },
    "@/lib/supabase/server": { createClient: async () => ({ from: (name: string) => { table = name; calls.push(["from", name]); return query; } }) },
  };
  const exports: Record<string, (...args: unknown[]) => Promise<any>> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
  const code = ts.transpileModule(readFileSync("src/lib/repositories/products.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports, require: (id: string) => { if (!(id in dependencies)) throw new Error(`Unexpected ${id}`); return dependencies[id]; } });
  return { api: exports, calls, disable: () => { allowed = false; }, fail: () => { dbError = { code: "23505" }; }, missing: () => { result = null; } };
}

test("real repository creates and edits with tenant derived from guard and decimal string writes", async () => {
  const { api, calls } = repositoryHarness();
  assert.equal((await api.saveCatalogProduct(null, { ...input, business_id: "spoof" })).ok, true);
  const inserted = calls.find(([method]) => method === "insert")?.[1] as Record<string, unknown>;
  assert.equal(inserted.business_id, tenant); assert.equal(inserted.sale_price, "8.00");
  calls.length = 0;
  assert.equal((await api.saveCatalogProduct(productId, input)).ok, true);
  assert.ok(calls.some(([method, key, value]) => method === "eq" && key === "business_id" && value === tenant));
  assert.ok(calls.some(([method, key, value]) => method === "eq" && key === "id" && value === productId));
  assert.equal(calls[0][0], "guard");
});

test("real repository enforces module on reads and writes, validates before writes and translates database errors", async () => {
  const { api, calls, disable, fail } = repositoryHarness();
  assert.equal((await api.saveCatalogProduct(null, { ...input, sale_price: "-1" })).ok, false);
  assert.ok(!calls.some(([method]) => method === "insert"));
  fail();
  assert.match((await api.saveCatalogProduct(null, input)).message, /Já existe/);
  disable();
  await assert.rejects(api.getProductCatalog(), /NOT_FOUND/);
  await assert.rejects(api.getProduct(productId), /NOT_FOUND/);
  await assert.rejects(api.saveCatalogProduct(null, input), /NOT_FOUND/);
  await assert.rejects(api.saveCatalogCategory(null, { name: "Bebidas", active: true }), /NOT_FOUND/);
  await assert.rejects(api.setCatalogProductActive(productId, false), /NOT_FOUND/);
});

test("inactivation/reactivation and category create/rename reuse guarded repository", async () => {
  const { api, calls, missing } = repositoryHarness();
  for (const active of [false, true]) {
    assert.equal((await api.setCatalogProductActive(productId, active)).ok, true);
    assert.ok(calls.some(([method, value]) => method === "update" && (value as { active: boolean }).active === active));
    assert.equal((await api.saveCatalogCategory(null, { name: "Bebidas", active })).ok, true);
    assert.equal((await api.saveCatalogCategory(productId, { name: "Bebidas frias", active })).ok, true);
  }
  missing();
  assert.equal((await api.setCatalogProductActive(productId, false)).ok, false);
});

test("real listing filters/paginates on the server and searches name, SKU and barcode safely", async () => {
  for (const search of ["Gatorade", "GAT-500", "00789", 'x,active.eq.true%_"']) {
    const { api, calls } = repositoryHarness();
    await api.getProductCatalog({ search, category: productId, status: "inactive", page: 2 });
    assert.ok(calls.some(([method, value]) => method === "or" && value === catalog.catalogSearchExpression(search)));
    assert.ok(calls.some(([method, key, value]) => method === "eq" && key === "active" && value === false));
    assert.ok(calls.some(([method, key, value]) => method === "eq" && key === "category_id" && value === productId));
    assert.ok(calls.some(([method, start, end]) => method === "range" && start === 30 && end === 59));
    assert.match(catalog.catalogSearchExpression(search), /^name\.ilike\./);
    assert.match(catalog.catalogSearchExpression(search), /sku\.ilike\./);
    assert.match(catalog.catalogSearchExpression(search), /barcode\.ilike\./);
  }
  assert.deepEqual(catalog.parseCatalogFilters({ page: -4, status: "bad", category: "bad" }), { search: "", page: 1, status: "all", category: "" });
});

test("route and real catalog UI expose only catalog concepts and guarded actions", () => {
  const page = readFileSync("src/app/admin/produtos/page.tsx", "utf8");
  const ui = readFileSync("src/components/admin/product-catalog.tsx", "utf8");
  const actions = readFileSync("src/app/admin/produtos/actions.ts", "utf8");
  assert.match(page, /getProductCatalog/);
  assert.match(ui, /Novo produto/); assert.match(ui, /Gerenciar categorias/); assert.match(ui, /Nenhum produto cadastrado/);
  assert.match(ui, /Código interno \/ SKU/); assert.match(ui, /Preço de custo/); assert.match(ui, /Preço de venda/); assert.match(ui, /Estoque mínimo/);
  assert.doesNotMatch(ui, /Estoque atual|Saldo atual/);
  assert.doesNotMatch(`${ui}${page}${actions}`, /business_id|stock_quantity|stock_balance|stock_movements/);
  assert.match(actions, /saveCatalogProduct/); assert.match(actions, /saveCatalogCategory/); assert.match(actions, /setCatalogProductActive/);
});
