import { fiscalSettingsReadiness, getProductFiscalReadiness, parseFiscalSettings } from "./fiscal-settings";
import { fiscalPaymentSnapshot, resolveFiscalPayment } from "./fiscal-payment";
import type { FiscalDocument } from "./fiscal";
import type { FocusNfcePayload } from "./providers/focus-nfe";

export type EmissionItem = {id:string;product_id:string;description:string;quantity:string;unit_price:string;total_amount:string;settings:unknown};
export type EmissionContext = {document:FiscalDocument;business:unknown;payment_method:string;sale_status:string;items:EmissionItem[]};
export type EmissionSelection = {payment_code:string;integration_type:string;acquirer_cnpj:string;authorization:string;brand:string;confirmed:boolean;simple_operation:boolean};
export const EMPTY_EMISSION_SELECTION:EmissionSelection = {payment_code:"",integration_type:"",acquirer_cnpj:"",authorization:"",brand:"",confirmed:false,simple_operation:false};

export function parseEmissionSelection(input:unknown):EmissionSelection {
  if(!input||typeof input!=="object"||Array.isArray(input)) throw Error("Revise a confirmação de emissão.");
  const source=input as Record<string,unknown>, result={...EMPTY_EMISSION_SELECTION};
  for(const key of ["payment_code","integration_type","acquirer_cnpj","authorization","brand"] as const) {
    if(typeof source[key]!=="string"||source[key].length>128) throw Error("Revise o detalhamento fiscal do pagamento.");
    result[key]=source[key].trim();
  }
  result.confirmed=source.confirmed===true; result.simple_operation=source.simple_operation===true;
  return result;
}

export function emissionReadiness(context:EmissionContext,now=new Date()) {
  const missing:string[]=[];
  const business=parseFiscalSettings("business",context.business??{});
  missing.push(...fiscalSettingsReadiness(business).missing);
  if(business.environment!=="homologation") missing.push("Emissão em produção ainda não está habilitada.");
  if(business.tax_regime!=="1") missing.push("Esta integração de homologação atende somente CRT 1 (Simples Nacional).");
  if(new Intl.DateTimeFormat("en",{year:"numeric",timeZone:"America/Sao_Paulo"}).format(now)!=="2026") missing.push("O enquadramento de IBS/CBS precisa ser revisado para este ano.");
  if(context.sale_status!=="completed") missing.push("A venda precisa estar finalizada.");
  if(!context.items?.length) missing.push("Documento sem itens.");
  for(const item of context.items??[]) {
    const settings=parseFiscalSettings("product",item.settings??{});
    const errors=[...getProductFiscalReadiness(settings,business.tax_regime).missing];
    if(settings.icms_code_type!=="csosn"||!["102","103","300","400"].includes(settings.icms_code)) errors.push("CSOSN exige tributação ainda não suportada nesta integração");
    for(const field of ["pis_code","cofins_code"] as const) if(!["04","06","07","08","09"].includes(settings[field])) errors.push(`${field==="pis_code"?"PIS":"COFINS"} exige enquadramento/cálculo não suportado`);
    if(!["5101","5102"].includes(settings.cfop)) errors.push("Somente venda interna simples CFOP 5101/5102 é suportada");
    if(settings.cest) errors.push("Operação com CEST requer validação tributária adicional não suportada");
    if(errors.length) missing.push(`${item.description}: ${errors.join(", ")}.`);
  }
  return {ready:missing.length===0,missing};
}

function scaled(value:string,scale:number) {
  if(!new RegExp(`^\\d+(?:\\.\\d{1,${scale}})?$`).test(value)) throw Error("Valor fiscal inválido.");
  const [whole,fraction=""]=value.split(".");
  return BigInt(whole)*BigInt(10)**BigInt(scale)+BigInt(fraction.padEnd(scale,"0"));
}
function cents(value:bigint) {return `${value/BigInt(100)}.${String(value%BigInt(100)).padStart(2,"0")}`;}

export function buildNfcePayload(context:EmissionContext,input:unknown,now=new Date()):FocusNfcePayload {
  const readiness=emissionReadiness(context,now);
  if(!readiness.ready) throw Error(`Configuração fiscal incompleta. ${readiness.missing.join(" ")}`);
  const selection=parseEmissionSelection(input);
  if(!selection.confirmed||!selection.simple_operation) throw Error("Confirme a homologação e o enquadramento da operação.");
  const business=parseFiscalSettings("business",context.business);
  const code=resolveFiscalPayment(context.payment_method,selection.payment_code);
  const payment:Record<string,string>={...fiscalPaymentSnapshot(context.payment_method,code,context.document.total_amount)};
  if(context.payment_method!=="cash") {
    if(!["1","2"].includes(selection.integration_type)) throw Error("Informe se o pagamento foi integrado ou não integrado.");
    payment.tipo_integracao=selection.integration_type;
    if(selection.integration_type==="1"&&(!selection.acquirer_cnpj||!selection.authorization)) throw Error("Pagamento integrado exige CNPJ da credenciadora e autorização.");
    if(selection.acquirer_cnpj) {
      if(!/^\d{14}$/.test(selection.acquirer_cnpj)) throw Error("CNPJ da credenciadora deve ter 14 dígitos.");
      payment.cnpj_credenciadora=selection.acquirer_cnpj;
    }
    if(selection.authorization) payment.numero_autorizacao=selection.authorization;
    if(selection.brand) {
      if(!/^(0[1-9]|1\d|2[0-6]|99)$/.test(selection.brand)) throw Error("Código de bandeira inválido.");
      payment.bandeira_operadora=selection.brand;
    }
  }
  let sum=BigInt(0);
  const items=context.items.map((item,index)=>{
    const p=parseFiscalSettings("product",item.settings);
    const exact=scaled(item.quantity,3)*scaled(item.unit_price,2);
    if(exact!==scaled(item.total_amount,5)) throw Error("Snapshot fiscal inconsistente.");
    const rounded=(exact+BigInt(500))/BigInt(1000); sum+=rounded;
    return {numero_item:String(index+1),codigo_produto:item.product_id,descricao:item.description,
      codigo_barras_comercial:p.fiscal_gtin,codigo_barras_tributavel:p.fiscal_gtin,
      codigo_ncm:p.ncm,cfop:p.cfop,unidade_comercial:p.fiscal_unit,unidade_tributavel:p.fiscal_unit,
      quantidade_comercial:item.quantity,quantidade_tributavel:item.quantity,
      valor_unitario_comercial:item.unit_price,valor_unitario_tributavel:item.unit_price,valor_bruto:cents(rounded),
      icms_origem:p.origin,icms_situacao_tributaria:p.icms_code,pis_situacao_tributaria:p.pis_code,cofins_situacao_tributaria:p.cofins_code};
  });
  if(sum!==scaled(context.document.total_amount,2)) throw Error("Arredondamento dos itens diverge do total. Revise o documento fiscal.");
  return {cnpj_emitente:business.cnpj,data_emissao:now.toISOString(),modalidade_frete:"9",local_destino:"1",
    presenca_comprador:"1",natureza_operacao:"VENDA AO CONSUMIDOR",indicador_inscricao_estadual_destinatario:"9",
    valor_total:context.document.total_amount,items,formas_pagamento:[payment as {forma_pagamento:string;valor_pagamento:string}]};
}
