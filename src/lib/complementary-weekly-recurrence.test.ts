import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { ManualReservationInput } from "@/types/appointments";

function repository() {
  const calls: {name:string;args:Record<string,unknown>}[]=[];
  const exports={};
  const code=ts.transpileModule(readFileSync("src/lib/repositories/admin-reservations.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  runInNewContext(code,{exports,require:(id:string)=>{
    if(id==="server-only")return {};
    if(id==="@/lib/time-of-day")return {};
    if(id==="@/lib/supabase/server")return {createClient:async()=>({rpc:async(name:string,args:Record<string,unknown>)=>{calls.push({name,args});return {error:null};}})};
    throw Error(id);
  }});
  return {api:exports as typeof import("./repositories/admin-reservations"),calls};
}
const input:ManualReservationInput={intent:"complementary",primary:null,complementary:{optionId:"resource",occupancyMode:"day",date:"2026-09-19",startTime:null,endTime:null},customerName:"Synthetic Client",customerWhatsapp:"53999990001"};

test("day recurrence sends one transactional request and no fabricated hours",async()=>{
  const {api,calls}=repository();await api.createAdminReservation({...input,repeatCount:8},"server-current-business");
  assert.equal(calls.length,1);assert.equal(calls[0].name,"create_admin_reservation_series");assert.equal(calls[0].args.p_repeat_count,8);assert.equal(calls[0].args.p_business_id,"server-current-business");
  const payload=calls[0].args.p_payload as Record<string,Record<string,unknown>>;
  assert.equal(payload.complementary.date,"2026-09-19");assert.ok(!("start_time" in payload.complementary));assert.ok(!("primary" in payload));
});
test("time-slot recurrence preserves the complementary interval in one payload",async()=>{
  const {api,calls}=repository();await api.createAdminReservation({...input,repeatCount:6,complementary:{...input.complementary!,occupancyMode:"time_slot",startTime:"18:30",endTime:"19:30"}},"tenant");
  const payload=calls[0].args.p_payload as Record<string,Record<string,unknown>>;
  assert.ok(!("primary" in payload));assert.equal(payload.complementary.start_time,"18:30");assert.equal(payload.complementary.end_time,"19:30");assert.equal(calls.length,1);
});
test("one-off creation is unchanged",async()=>{
  const {api,calls}=repository();await api.createAdminReservation(input,"tenant");assert.equal(calls[0].name,"create_admin_reservation");
  assert.equal(calls.length,1);
});
test("Admin exposes finite complementary-only recurrence without new cancellation actions",()=>{
  const form=readFileSync("src/components/admin/appointment-form-modal.tsx","utf8");
  assert.ok(form.includes('repeatCount: recurring && intent === "complementary" ? repeatCount'));
  assert.ok(form.includes('(intent === "primary" || (intent === "complementary" && complementaryOptionId))'));
  assert.match(form,/Quantidade de ocorrências semanais/);
  for(const file of ["appointment-details","complementary-reservation-details"])assert.doesNotMatch(readFileSync(`src/components/admin/${file}.tsx`,"utf8"),/ReservationSeriesCancellation/);
});

test("recurrence fails closed without server business or with combined intent",async()=>{
  const {api,calls}=repository();
  assert.equal((await api.createAdminReservation({...input,repeatCount:3}))?.code,"22023");
  assert.equal((await api.createAdminReservation({...input,intent:"combined",repeatCount:3},"tenant"))?.code,"22023");
  assert.equal(calls.length,0);
});
