import "server-only";
import { requireBusinessModule } from "@/lib/auth/business-module";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validCatalogId } from "@/lib/product-catalog";
import { buildNfcePayload, emissionReadiness, type EmissionContext } from "@/lib/fiscal-emission";
import { createFocusNfeProvider, type FocusNfcePayload } from "@/lib/providers/focus-nfe";
import type { Json } from "@/types/database";
import type { ActionResult } from "@/types/business";

async function context(id:string) {
  const business=await requireBusinessModule("fiscal");
  if(!validCatalogId(id)) throw Error("Documento fiscal inválido.");
  const supabase=await createClient();
  const {data,error}=await supabase.rpc("get_admin_fiscal_emission_context",{p_business_id:business.id,p_document_id:id});
  if(error||!data) throw Error("Documento fiscal indisponível para este negócio.");
  return {business,supabase,value:data as unknown as EmissionContext};
}
export async function getFiscalEmissionView(id:string) {
  const {value}=await context(id);
  let readiness;
  try {readiness=emissionReadiness(value);} catch {readiness={ready:false,missing:["Revise os dados fiscais cadastrados."]};}
  const snapshot=value.document.provider_request_snapshot as {formas_pagamento?:{forma_pagamento?:string}[]}|null;
  return {readiness,paymentMethod:value.payment_method,recordedPayment:snapshot?.formas_pagamento?.[0]?.forma_pagamento??null};
}

export async function dispatchFiscalDocument(id:string,input:unknown,emit:boolean):Promise<ActionResult> {
  // Resolve current business/session before constructing any privileged client.
  const {business,supabase,value}=await context(id);
  const user=await supabase.auth.getUser();
  if(user.error||!user.data.user) return {ok:false,message:"Entre novamente para continuar."};
  if(!process.env.FOCUS_NFE_TOKEN?.trim()) return {ok:false,message:"Integração Focus NFe não configurada."};
  let request:FocusNfcePayload|null=null;
  if(emit&&value.document.status==="draft") {
    try {request=buildNfcePayload(value,input);} catch(error){return {ok:false,message:(error as Error).message};}
  }
  try {
    const admin=createAdminClient();
    const claim=await admin.rpc("claim_fiscal_dispatch",{p_business_id:business.id,p_actor_id:user.data.user.id,
      p_document_id:id,p_context:value as unknown as Json,p_request:request as unknown as Json,p_emit:emit});
    if(claim.error) return {ok:false,message:"Não foi possível preparar o envio. Atualize a página e revise a configuração fiscal."};
    const data=claim.data as {busy?:boolean;token?:string;emit?:boolean;request?:FocusNfcePayload;environment?:string};
    if(data.busy) return {ok:false,message:"Já existe uma consulta ou emissão em andamento. Aguarde um minuto e atualize o status."};
    if(!data.token||!data.request||data.environment!=="homologation") return {ok:false,message:"Emissão em produção ainda não está habilitada."};
    const provider=createFocusNfeProvider();
    // Claim has committed: never hold a SQL transaction across this HTTP call.
    const result=data.emit?await provider.emitNfce(data.environment,id,data.request)
      :await provider.getNfce(data.environment,id,data.request.cnpj_emitente);
    const saved=await admin.rpc("record_fiscal_dispatch",{p_business_id:business.id,p_document_id:id,p_token:data.token,p_result:result as unknown as Json});
    if(saved.error||!saved.data) return {ok:false,message:"Resultado ainda não reconciliado. Use Atualizar status; não crie outro documento."};
    return {ok:true,message:result.status==="authorized"?"NFC-e autorizada em homologação, sem validade fiscal."
      :result.status==="rejected"?"NFC-e rejeitada. Consulte a mensagem no documento."
      :result.status==="cancelled"?"Cancelamento informado pela Focus."
      :"Resultado ainda não confirmado. Use Atualizar status."};
  } catch {
    return {ok:false,message:"Não foi possível confirmar o resultado. Use Atualizar status para consultar a mesma referência."};
  }
}
