import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as financial from "./financial";

const input = { entry_type: "income", amount: "12,50", description: " Recebido ", payment_method: "pix", entry_date: "2026-09-05", status: "paid" };
test("financial input preserves exact money and rejects invalid values and dates", () => {
  assert.deepEqual(financial.parseFinancialInput({ ...input, business_id: "forged", created_by: "forged" }), { ...input, amount: "12.50", description: "Recebido" });
  for (const patch of [{ amount: "0" }, { amount: "-1" }, { amount: "1.001" }, { entry_date: "2026-02-30" }, { status: "partial" }, { entry_type: "refund" }, { payment_method: "bank" }]) assert.throws(() => financial.parseFinancialInput({ ...input, ...patch }));
  assert.equal(financial.parseFinancialInput({ ...input, entry_type: "expense", status: "pending", payment_method: "other" }).status, "pending");
  assert.deepEqual(financial.financialMonth("2026-12"), { month: "2026-12", start: "2026-12-01", end: "2027-01-01" });
});
test("real repository allowlists origin and derives tenant through guard", async () => {
  let allowed = true;
  const calls: Array<[string, Record<string, unknown>]> = [];
  const dependencies: Record<string, unknown> = {
    "server-only": {}, "@/lib/financial": financial,
    "@/lib/auth/business-module": { requireBusinessModule: async (module: string) => { assert.equal(module,"management"); if(!allowed) throw Error("denied");return {id:"tenant"}; } },
    "@/lib/supabase/server": { createClient: async () => ({rpc: async (name: string, payload: Record<string, unknown>) => { calls.push([name,payload]);return {data:{id:"entry",amount:12.5,description:null,payment_method:null},error:null}; }}) },
  };
  const exports: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  const code=ts.transpileModule(readFileSync("src/lib/repositories/financial.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  runInNewContext(code,{exports,require:(name:string)=>{if(!(name in dependencies))throw Error(name);return dependencies[name];}});
  await exports.createFinancialEntry({...input,source_type:"sale",source_id:"forged",business_id:"forged"});
  assert.equal(calls[0][1].p_source_type,"manual");assert.equal(calls[0][1].p_source_id,null);
  assert.equal(calls[0][1].p_amount,"12.50");assert.ok(!("business_id" in calls[0][1]));
  await exports.createFinancialEntry({...input,entry_type:"expense"},{type:"appointment",id:"ee640000-0000-4000-8000-000000000001"});
  assert.equal(calls[1][1].p_entry_type,"income");
  allowed=false;
  await assert.rejects(exports.createFinancialEntry(input),/denied/);
  await assert.rejects(exports.getFinancialMonth("2026-09"),/denied/);
  await assert.rejects(exports.getBookingFinancialEntry({}),/denied/);
});
