import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as receipts from "./receipts";
import * as financial from "./financial";
import * as catalog from "./product-catalog";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "../components/ui/button";
import * as field from "../components/ui/field";

const id = "ae740000-0000-4000-8000-000000000001";
function load<T>(path: string, deps: Record<string, unknown>): T {
  const exports = {};
  const code = ts.transpileModule(readFileSync(path,"utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(code, { exports, Intl, document: { getElementById: () => null }, crypto: { randomUUID: () => id }, require: (name: string) => { if (!(name in deps)) throw Error(name); return deps[name]; } });
  return exports as T;
}
test("receipt validation: positive exact amounts, methods, optional payer, allowlisted origin", () => {
  for (const method of ["pix","cash","card","other"]) assert.deepEqual(receipts.parseReceipt({ key: id, amount: "12,50", method, payer: " João ", business_id: "forged" }), { key: id, amount: "12.50", method, payer: "João" });
  assert.equal(receipts.parseReceipt({key:id,amount:"30",method:"pix",payer:""}).payer, "");
  for (const amount of ["0","-1","0.001","NaN"]) assert.throws(() => receipts.receiptAmount(amount));
  assert.throws(() => receipts.parseReceipt({key:id,amount:"30",method:"bitcoin",payer:""}));
  for (const type of ["sale","appointment","reservation"]) assert.equal(receipts.parseReceiptTarget({type,id,business_id:"forged"}).type,type);
  assert.throws(() => receipts.parseReceiptTarget({type:"manual",id}));
});
test("split is an editable suggestion with cents, never a persisted allocation", () => {
  assert.equal(receipts.splitReceiptSuggestion("120",6),"20.00");
  assert.equal(receipts.splitReceiptSuggestion("100",3),"33.33");
  assert.equal(receipts.splitReceiptSuggestion("33.34",1),"33.34");
  for (const count of [0,-1,1.5,Infinity]) assert.throws(() => receipts.splitReceiptSuggestion("120",count));
  assert.throws(() => receipts.splitReceiptSuggestion("0.01",2));
});
test("receipt repository always resolves current business and shares canonical RPC path", async () => {
  let allowed=true; const calls: [string,Record<string,unknown>][]=[];
  const repo=load<typeof import("./repositories/receipts")>("src/lib/repositories/receipts.ts", {
    "server-only":{},"@/lib/receipts":receipts,
    "@/lib/auth/business-module":{ requireBusinessModule:async (module:string)=>{assert.equal(module,"management");if(!allowed)throw Error("denied");return {id:"current-B"};} },
    "@/lib/supabase/server":{ createClient:async()=>({rpc:async(name:string,args:Record<string,unknown>)=>{calls.push([name,args]);return {error:null,data:{total:"120",received:"30",remaining:"90",entries:[]}};}}) },
  });
  const target={type:"reservation",id,business_id:"A"};
  assert.equal((await repo.registerOriginReceipt(target,{key:id,amount:"30",method:"pix",payer:"",business_id:"A"})).ok,true);
  await repo.readOriginReceipts(target); await repo.defineBookingTotal(target,"120");
  assert.deepEqual(calls.map(([name])=>name),["register_admin_receipt","get_admin_origin_receipts","set_admin_booking_financial_total"]);
  for(const [,args] of calls) assert.equal(args.p_business_id,"current-B");
  assert.equal(calls[0][1].p_receipt_key,id); assert.equal(calls[0][1].p_amount,"30.00");
  assert.ok(!("p_status" in calls[0][1]));
  allowed=false; await assert.rejects(repo.registerOriginReceipt(target,{}),/denied/); await assert.rejects(repo.readOriginReceipts(target),/denied/);
});
test("real shared detail renders total, received, remaining and payer without changing operational state", () => {
  const data:receipts.OriginReceipts={total:"120",received:"50",remaining:"70",entries:[{id,amount:"30",payer_name:"João",payment_method:"pix",paid_at:"2026-09-14T12:00:00Z",status:"paid"},{id:"second",amount:"20",payer_name:null,payment_method:"cash",paid_at:"2026-09-14T12:00:00Z",status:"paid"}]};
  function render(value:receipts.OriginReceipts, presentation: "detail" | "compact" = "detail") {
    let slot=0;
    const {OriginPayments}=load<{OriginPayments:React.ComponentType<{target:receipts.ReceiptTarget;initialData?:receipts.OriginReceipts;presentation?:"detail"|"compact"}>}>("src/components/admin/origin-payments.tsx", {
      react:{...React,useEffect:()=>{},useState:(initial:unknown)=>[++slot===1?value:initial,()=>{}],useTransition:()=>[false,()=>{}]},
      "react/jsx-runtime":jsx,"@/app/admin/financeiro/receipt-actions":{},"@/components/ui/button":{Button},"@/components/ui/field":field,
      "@/components/ui/modal":{Modal:()=>null},"@/lib/financial":financial,"@/lib/product-catalog":catalog,"@/lib/receipts":receipts,
    });
    return renderToStaticMarkup(React.createElement(OriginPayments,{target:{type:"reservation",id},initialData:value,presentation}));
  }
  const html=render(data);
  for(const label of ["Total","Recebido","Restante","120,00","50,00","70,00","João","Pix","Dinheiro","Registrar pagamento"])assert.ok(html.includes(label),label);
  assert.match(render({...data,total:null,received:"0",remaining:null,entries:[]}),/Definir total devido/);
  assert.doesNotMatch(render({...data,received:"120",remaining:"0"}),/>Registrar pagamento</);
  const compact = render(data, "compact");
  assert.match(compact, />Receber</); assert.doesNotMatch(compact, /<h3|Nenhum recebimento registrado/);
  assert.doesNotMatch(render({...data,received:"120",remaining:"0"}, "compact"), />Receber</);
});

test("real receipt form suggests a share and sends one bounded, idempotent receipt", async () => {
  const data: receipts.OriginReceipts = { total: "120", received: "30", remaining: "90", entries: [] };
  const state: unknown[] = [data, "", "", true, "1", "João", "pix", "6", true, 0];
  const refs = [{ current: id }, { current: false }];
  let stateIndex = 0, refIndex = 0;
  const pending: Promise<unknown>[] = [], calls: unknown[][] = [];
  const { OriginPayments } = load<{ OriginPayments: (props: { target: receipts.ReceiptTarget }) => React.ReactElement }>("src/components/admin/origin-payments.tsx", {
    react: { ...React, useId: () => "receipt", useEffect: () => {},
      useState: () => { const i = stateIndex++; return [state[i], (value: unknown) => { state[i] = typeof value === "function" ? value(state[i]) : value; }]; },
      useRef: () => refs[refIndex++], useTransition: () => [false, (fn: () => Promise<unknown>) => pending.push(fn())] },
    "react/jsx-runtime": jsx, "@/app/admin/financeiro/receipt-actions": { registerReceipt: async (...args: unknown[]) => { calls.push(args); return { ok: true, message: "Pagamento registrado." }; } },
    "@/components/ui/button": { Button }, "@/components/ui/field": field, "@/components/ui/modal": { Modal: () => null },
    "@/lib/financial": financial, "@/lib/product-catalog": catalog, "@/lib/receipts": receipts,
  });
  type Node = React.ReactElement<Record<string, unknown>>;
  function nodes(value: unknown): Node[] {
    if (Array.isArray(value)) return value.flatMap(nodes);
    if (!React.isValidElement(value)) return [];
    const node = value as Node;
    return [node, ...nodes(node.props.children)];
  }
  function render() { stateIndex = 0; refIndex = 0; return nodes(OriginPayments({ target: { type: "sale", id } })); }
  const suggest = render().find(node => node.props.children === "Usar sugestão")!;
  (suggest.props.onClick as () => void)();
  assert.equal(state[4], "15.00");
  const form = render().find(node => node.type === "form")!;
  const submit = form.props.onSubmit as (event: { preventDefault: () => void; stopPropagation: () => void }) => void;
  const event = { preventDefault() {}, stopPropagation() {} };
  submit(event); submit(event); // Immediate repeated submit is ignored.
  await Promise.all(pending);
  assert.equal(calls.length, 1);
  assert.equal(JSON.stringify(calls[0]), JSON.stringify([{ type: "sale", id }, { key: id, amount: "15.00", method: "pix", payer: "João" }]));
  assert.equal(state[3], false); assert.equal(state[2], "Pagamento registrado.");
});

test("compact Copa action refreshes the shared ledger before opening payment", async () => {
  const initial: receipts.OriginReceipts = { total: "120", received: "30", remaining: "90", entries: [] };
  const fresh: receipts.OriginReceipts = { total: "120", received: "70", remaining: "50", entries: [] };
  const state: unknown[] = [initial, "", "", false, "", "", "", "", false, 0];
  let stateIndex = 0, refIndex = 0; const refs = [{ current: null }, { current: false }];
  const pending: Promise<unknown>[] = [], calls: unknown[] = [];
  const { OriginPayments } = load<{ OriginPayments: (props: { target: receipts.ReceiptTarget; initialData: receipts.OriginReceipts; presentation: "compact" }) => React.ReactElement }>("src/components/admin/origin-payments.tsx", {
    react: { ...React, useId: () => "compact", useEffect: () => {},
      useState: () => { const index = stateIndex++; return [state[index], (value: unknown) => { state[index] = typeof value === "function" ? value(state[index]) : value; }]; },
      useRef: () => refs[refIndex++], useTransition: () => [false, (fn: () => Promise<unknown>) => pending.push(fn())] },
    "react/jsx-runtime": jsx, "@/app/admin/financeiro/receipt-actions": { readReceipts: async (target: unknown) => { calls.push(target); return fresh; } },
    "@/components/ui/button": { Button }, "@/components/ui/field": field, "@/components/ui/modal": { Modal: () => null },
    "@/lib/financial": financial, "@/lib/product-catalog": catalog, "@/lib/receipts": receipts,
  });
  function nodes(value: unknown): React.ReactElement<Record<string, unknown>>[] {
    if (Array.isArray(value)) return value.flatMap(nodes);
    if (!React.isValidElement<Record<string, unknown>>(value)) return [];
    return [value, ...nodes(value.props.children)];
  }
  const tree = nodes(OriginPayments({ target: { type: "reservation", id }, initialData: initial, presentation: "compact" }));
  (tree.find(node => node.props.children === "Receber")!.props.onClick as () => void)();
  await Promise.all(pending);
  assert.deepEqual(calls, [{ type: "reservation", id }]);
  assert.deepEqual(state[0], fresh); assert.equal(state[4], "50"); assert.equal(state[3], true);
});
