import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import ts from "typescript";
import {buildNfcePayload,emissionReadiness,EMPTY_EMISSION_SELECTION,type EmissionContext} from "./fiscal-emission";
import {parseFiscalSettings} from "./fiscal-settings";
import {validCatalogId} from "./product-catalog";

const id="de670000-0000-4000-8000-000000000001",now=new Date("2026-09-06T15:00:00Z");
const selection={...EMPTY_EMISSION_SELECTION,confirmed:true,simple_operation:true,payment_code:"20",integration_type:"2"};
function fixture():EmissionContext {
  return {document:{id,business_id:"business-B",status:"draft",total_amount:"10.00",provider_request_snapshot:null},
    business:parseFiscalSettings("business",{legal_name:"Teste",cnpj:"12345678000190",state_registration:"ISENTO",tax_regime:"1",address_street:"Rua",address_number:"10",address_neighborhood:"Centro",address_city:"São Paulo",address_city_code:"3550308",address_state:"SP",address_zip_code:"01001000"}),
    payment_method:"pix",sale_status:"completed",items:[{id:"item",product_id:id,description:"Snapshot original",quantity:"1.000",unit_price:"10.00",total_amount:"10.00000",
      settings:parseFiscalSettings("product",{ncm:"12345678",cfop:"5102",origin:"0",icms_code_type:"csosn",icms_code:"102",fiscal_unit:"UN",fiscal_gtin:"SEM GTIN",pis_code:"07",cofins_code:"07"})}]} as EmissionContext;
}
test("payload uses immutable commercial values and explicit tax/payment fields without invented rates",()=>{
  const context=fixture(),before=structuredClone(context),payload=buildNfcePayload(context,selection,now);
  assert.equal(payload.items[0].descricao,"Snapshot original");assert.equal(payload.items[0].valor_unitario_comercial,"10.00");
  assert.equal(payload.items[0].unidade_comercial,"UN");assert.equal(payload.items[0].pis_situacao_tributaria,"07");
  assert.equal(payload.formas_pagamento[0].forma_pagamento,"20");assert.equal(payload.formas_pagamento[0].valor_pagamento,"10.00");
  assert.equal(payload.data_emissao,now.toISOString());assert.equal(payload.valor_total,"10.00");
  assert.deepEqual(context,before);assert.ok(!JSON.stringify(payload).includes("aliquota"));assert.ok(!JSON.stringify(payload).includes("ibs"));
});
test("readiness blocks production, incomplete products/emitter, unsupported taxes/year and unconfirmed scope",()=>{
  for(const change of [(c:EmissionContext)=>{(c.business as Record<string,string>).environment="production";},
    (c:EmissionContext)=>{(c.business as Record<string,string>).cnpj="";},
    (c:EmissionContext)=>{(c.business as Record<string,string>).tax_regime="3";},
    (c:EmissionContext)=>{(c.items[0].settings as Record<string,string>).fiscal_unit="";},
    (c:EmissionContext)=>{(c.items[0].settings as Record<string,string>).pis_code="99";},
    (c:EmissionContext)=>{(c.items[0].settings as Record<string,string>).icms_code="500";},
    (c:EmissionContext)=>{c.sale_status="draft";}]) {
    const c=fixture();change(c);assert.equal(emissionReadiness(c,now).ready,false);assert.throws(()=>buildNfcePayload(c,selection,now));
  }
  assert.equal(emissionReadiness(fixture(),new Date("2027-01-02T12:00:00Z")).ready,false);
  for(const patch of [{confirmed:false},{simple_operation:false},{payment_code:""},{integration_type:""},{integration_type:"1"}]) assert.throws(()=>buildNfcePayload(fixture(),{...selection,...patch},now));
});
test("integrated payment requires actual acquirer/authorization; cash only is automatic",()=>{
  const c=fixture();c.payment_method="card";
  const p=buildNfcePayload(c,{...selection,payment_code:"04",integration_type:"1",acquirer_cnpj:"12345678000190",authorization:"TEST-123",brand:"01"},now);
  assert.equal(p.formas_pagamento[0].forma_pagamento,"04");
  assert.equal((p.formas_pagamento[0] as Record<string,string>).numero_autorizacao,"TEST-123");
  c.payment_method="cash";assert.equal(buildNfcePayload(c,{...selection,payment_code:""},now).formas_pagamento[0].forma_pagamento,"01");
});
test("decimal totals and fractional quantities are exact; inconsistent rounding fails instead of adjusting",()=>{
  const c=fixture();c.items[0].quantity="1.125";c.items[0].total_amount="11.25000";c.document.total_amount="11.25";
  assert.equal(buildNfcePayload(c,selection,now).items[0].valor_bruto,"11.25");
  c.document.total_amount="11.24";assert.throws(()=>buildNfcePayload(c,selection,now),/Arredondamento/);
  c.items[0].total_amount="11.24000";assert.throws(()=>buildNfcePayload(c,selection,now),/inconsistente/);
});

test("real emission repository enforces current tenant and commits claim before HTTP/result; repeat only queries frozen request",async()=>{
  let c=fixture(),allowed=true,missing=false,busy=false,claimError=false;
  const calls:string[]=[],rpcArgs:Record<string,unknown>[]=[];
  const exports:Record<string,(...args:unknown[])=>Promise<{ok?:boolean;message?:string}>>={};
  const dependencies:Record<string,unknown>={"server-only":{},"@/lib/product-catalog":{validCatalogId},
    "@/lib/auth/business-module":{requireBusinessModule:async(module:string)=>{assert.equal(module,"fiscal");if(!allowed)throw Error("blocked");return{id:"business-B"};}},
    "@/lib/supabase/server":{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:"actor"}},error:null})},rpc:async(name:string,args:Record<string,unknown>)=>{calls.push(name);assert.equal(args.p_business_id,"business-B");return{data:missing?null:structuredClone(c),error:null};}})},
    "@/lib/supabase/admin":{createAdminClient:()=>({rpc:async(name:string,args:Record<string,unknown>)=>{
      calls.push(name);rpcArgs.push(args);assert.equal(args.p_business_id,"business-B");
      if(name==="record_fiscal_dispatch")return{data:true,error:null};
      if(claimError)return{data:null,error:{}};
      const request=c.document.provider_request_snapshot??args.p_request;
      const emit=c.document.status==="draft";
      if(!busy){c.document.status="pending";c.document.provider_request_snapshot=request as never;}
      return{data:{busy,token:"nonce",request,emit,environment:"homologation"},error:null};
    }})},
    "@/lib/fiscal-emission":{buildNfcePayload:(context:EmissionContext,input:unknown)=>buildNfcePayload(context,input,now),emissionReadiness},
    "@/lib/providers/focus-nfe":{createFocusNfeProvider:()=>({emitNfce:async()=>{assert.equal(c.document.status,"pending");calls.push("POST");return{status:"pending"};},getNfce:async(environment:string,documentId:string,cnpj:string)=>{assert.equal(environment,"homologation");assert.equal(documentId,id);assert.equal(cnpj,"12345678000190");calls.push("GET");return{status:"authorized"};}})},
  };
  runInNewContext(ts.transpileModule(readFileSync("src/lib/repositories/fiscal-emission.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,require:(name:string)=>{assert.ok(name in dependencies,name);return dependencies[name];},process:{env:{FOCUS_NFE_TOKEN:"mock-only"}}});
  assert.equal((await exports.dispatchFiscalDocument(id,{...selection,business_id:"A"},true)).ok,true);
  assert.deepEqual(calls,["get_admin_fiscal_emission_context","claim_fiscal_dispatch","POST","record_fiscal_dispatch"]);
  assert.equal(rpcArgs[0].p_actor_id,"actor");
  calls.length=0;(c.business as Record<string,string>).cnpj="00000000000000";
  await exports.dispatchFiscalDocument(id,null,true);assert.ok(calls.includes("GET"));assert.ok(!calls.includes("POST"));
  calls.length=0;busy=true;await exports.dispatchFiscalDocument(id,null,false);assert.ok(!calls.includes("GET"));busy=false;
  calls.length=0;c=fixture();(c.business as Record<string,string>).environment="production";
  assert.equal((await exports.dispatchFiscalDocument(id,selection,true)).ok,false);assert.equal(calls.length,1);
  c=fixture();claimError=true;calls.length=0;await exports.dispatchFiscalDocument(id,selection,true);assert.ok(!calls.includes("POST"));claimError=false;
  missing=true;await assert.rejects(exports.dispatchFiscalDocument(id,selection,true),/indisponível/);missing=false;
  allowed=false;await assert.rejects(exports.dispatchFiscalDocument(id,selection,true),/blocked/);
});
