"use client";
import {useState,useTransition,useEffect} from "react";
import {Button} from "@/components/ui/button";
import {Label,Input,Select} from "@/components/ui/field";
import {Badge} from "@/components/ui/badge";
import {BUSINESS_FISCAL_FIELDS,PRODUCT_FISCAL_FIELDS,FISCAL_FIELD_LABELS,TAX_REGIMES,PRODUCT_ORIGINS,parseFiscalSettings,fiscalSettingsReadiness,getProductFiscalReadiness,type BusinessFiscalSettings,type ProductFiscalSettings} from "@/lib/fiscal-settings";
import {saveFiscalBusiness,saveFiscalProduct,readProductFiscalSettings} from "@/app/admin/fiscal/actions";

export function FiscalSettingsForm({initial,productId,taxRegime=""}:{initial:BusinessFiscalSettings|ProductFiscalSettings;productId?:string;taxRegime?:string}) {
 const [form,setForm]=useState<Record<string,string>>(initial),[pending,start]=useTransition(),[feedback,setFeedback]=useState<{ok:boolean;message:string}|null>(null);
 const fields=productId?PRODUCT_FISCAL_FIELDS:BUSINESS_FISCAL_FIELDS;
 const groups=productId?[{title:"Classificação fiscal",fields:[...fields]}]:[
   {title:"Dados do emitente",fields:[...BUSINESS_FISCAL_FIELDS.slice(0,5)]},
   {title:"Endereço fiscal",fields:[...BUSINESS_FISCAL_FIELDS.slice(6)]},
   {title:"Ambiente",fields:["environment"]}
 ];
 const readiness=productId?getProductFiscalReadiness(form as ProductFiscalSettings,taxRegime):fiscalSettingsReadiness(form as BusinessFiscalSettings);
 const options:Record<string,Record<string,string>>={tax_regime:TAX_REGIMES,environment:{homologation:"Homologação",production:"Produção"},origin:PRODUCT_ORIGINS,icms_code_type:{csosn:"CSOSN (3 dígitos)",cst:"CST (2 dígitos)"}};
 return <form className="space-y-5" onSubmit={event=>{
   event.preventDefault();setFeedback(null);
   try {if(productId)parseFiscalSettings("product",form);else parseFiscalSettings("business",form);}
   catch(error){setFeedback({ok:false,message:(error as Error).message});return;}
   start(async()=>{try{setFeedback(productId?await saveFiscalProduct(productId,form):await saveFiscalBusiness(form));}catch{setFeedback({ok:false,message:"Não foi possível salvar agora. Tente novamente."});}});
 }}>
   <div className="space-y-2">
     <Badge variant={readiness.ready?"success":"neutral"}>{readiness.ready?"Dados fiscais completos":"Configuração incompleta"}</Badge>
     <p className="text-sm text-muted">Completude cadastral apenas. Não significa pronto para emitir. Confirme a classificação com o responsável fiscal.</p>
     {!!readiness.missing.length&&<p className="text-sm text-muted">Faltam: {readiness.missing.join(", ")}.</p>}
   </div>
   {groups.map(group=><section key={group.title} className="space-y-3"><h3 className="font-semibold">{group.title}</h3><div className="grid gap-4 sm:grid-cols-2">
     {group.fields.map(field=><div key={field} className="min-w-0 space-y-2"><Label htmlFor={`fiscal-${field}`}>{FISCAL_FIELD_LABELS[field]}</Label>
       {options[field]?<Select id={`fiscal-${field}`} value={form[field]} onChange={e=>setForm({...form,[field]:e.target.value})}><option value="">Não informado</option>{Object.entries(options[field]).map(([value,label])=><option key={value} value={value}>{field==="origin"?value+" — ":""}{label}</option>)}</Select>:
       <Input id={`fiscal-${field}`} maxLength={200} value={form[field]} onChange={e=>setForm({...form,[field]:e.target.value})}/>}
     </div>)}
   </div></section>)}
   {!productId&&<p className="text-sm text-muted">{form.environment==="production"?"Produção está selecionada, mas a emissão fiscal ainda não está habilitada.":"Ambiente destinado a testes. Nenhuma emissão real está disponível nesta etapa."}</p>}
   <Button type="submit" disabled={pending}>{pending?"Salvando…":productId?"Salvar dados fiscais do produto":"Salvar configuração fiscal"}</Button>
   {feedback&&<p role={feedback.ok?"status":"alert"} className={`text-sm ${feedback.ok?"text-success":"text-danger"}`}>{feedback.message}</p>}
 </form>;
}
export function ProductFiscalEditor({productId}:{productId:string}) {
 const [data,setData]=useState<Awaited<ReturnType<typeof readProductFiscalSettings>>|null>(null),[error,setError]=useState(false),[retry,setRetry]=useState(0);
 useEffect(()=>{let active=true;readProductFiscalSettings(productId).then(value=>{if(active)setData(value);}).catch(()=>{if(active)setError(true);});return()=>{active=false;};},[productId,retry]);
 return <section className="mt-6 space-y-4 border-t pt-5"><h2 className="font-semibold">Dados fiscais</h2>
   {data?<FiscalSettingsForm initial={data.settings} productId={productId} taxRegime={data.taxRegime}/>:error?<div><p role="alert" className="text-sm text-danger">Não foi possível carregar os dados fiscais.</p><Button variant="outline" onClick={()=>{setError(false);setRetry(retry+1);}}>Tentar novamente</Button></div>:<p role="status" className="text-sm text-muted">Carregando dados fiscais…</p>}
 </section>;
}
