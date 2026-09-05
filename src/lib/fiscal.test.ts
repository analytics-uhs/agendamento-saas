import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as fiscal from "./fiscal";
import { validCatalogId } from "./product-catalog";

test("fiscal labels and controlled errors do not simulate emission", () => {
  assert.equal(fiscal.FISCAL_STATUSES.draft, "Rascunho");
  assert.equal(fiscal.FISCAL_BADGES.authorized, "success");
  assert.match(fiscal.fiscalError({ message: "fiscal_sale_not_completed" }), /Finalize a venda/);
  assert.match(fiscal.fiscalError({ message: "fiscal_total_mismatch" }), /não confere/);
  assert.match(fiscal.fiscalError({ code: "42501" }), /indisponível/);
  assert.equal(fiscal.fiscalDate(null), "—");
});

test("real fiscal repository uses explicit server business and module on every operation", async () => {
  const saleId = "ce650000-0000-4000-8000-000000000001";
  const calls: Array<[string, unknown]> = [];
  let allowed = true;
  let error: { message: string } | null = null;
  const result = { data: { id: "document", total_amount: "20.25" }, error: null };
  const query = {
    select: (value: string) => { calls.push(["select", value]); return query; },
    eq: (field: string, value: string) => { calls.push([field, value]); return query; },
    order: () => query,
    range: async () => ({ data: [], count: 0, error: null }),
    maybeSingle: async () => ({ data: null, error: null }),
  };
  const dependencies: Record<string, unknown> = {
    "server-only": {}, "@/lib/fiscal": fiscal, "@/lib/product-catalog": { validCatalogId },
    "@/lib/auth/business-module": { requireBusinessModule: async (module: string) => {
      assert.equal(module, "fiscal"); if (!allowed) throw Error("disabled"); return { id: "current-B" };
    } },
    "@/lib/supabase/server": { createClient: async () => ({
      from: () => query,
      rpc: async (name: string, payload: unknown) => { calls.push([name, payload]); return { ...result, error }; },
    }) },
  };
  const exports: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  const code = ts.transpileModule(readFileSync("src/lib/repositories/fiscal.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports, require: (name: string) => { if (!(name in dependencies)) throw Error(name); return dependencies[name]; } });
  assert.equal((await exports.prepareFiscalDocument({ saleId, business_id: "forged" }) as { ok: boolean }).ok, false);
  assert.equal(calls.length, 0);
  const prepared = await exports.prepareFiscalDocument(saleId) as { ok: boolean; data: { id: string } };
  assert.equal(prepared.ok, true);
  assert.equal(prepared.data.id, "document");
  assert.equal(calls[0][0], "prepare_admin_fiscal_document");
  assert.equal(JSON.stringify(calls[0][1]), JSON.stringify({ p_business_id: "current-B", p_sale_id: saleId }));
  await exports.listFiscalDocuments();
  await exports.getFiscalDocument(saleId);
  await exports.getSaleFiscalDocument(saleId);
  assert.equal(calls.filter(([key, value]) => key === "business_id" && value === "current-B").length, 3);
  assert.ok(calls.some(([key, value]) => key === "select" && String(value).includes("total_amount::text")));
  error = { message: "fiscal_total_mismatch" };
  assert.equal((await exports.prepareFiscalDocument(saleId) as { ok: boolean }).ok, false);
  allowed = false;
  for (const name of ["prepareFiscalDocument", "listFiscalDocuments", "getFiscalDocument", "getSaleFiscalDocument"]) {
    await assert.rejects(exports[name](saleId), /disabled/);
  }
});
