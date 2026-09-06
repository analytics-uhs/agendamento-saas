"use client";
import Link from "next/link";
import {useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {Button} from "@/components/ui/button";
import {Label,Input,Select} from "@/components/ui/field";
import {fiscalPaymentOptions,FISCAL_PAYMENT_LABELS,type FiscalPaymentCode} from "@/lib/fiscal-payment";
import {EMPTY_EMISSION_SELECTION} from "@/lib/fiscal-emission";
import {emitNfce,refreshNfceStatus} from "@/app/admin/fiscal/actions";

export function FiscalEmissionForm({id,status,paymentMethod,readiness,recordedPayment}:{id:string;status:string;paymentMethod:string;readiness:{ready:boolean;missing:string[]};recordedPayment:string|null}) {
  const [form,setForm]=useState({...EMPTY_EMISSION_SELECTION}),[pending,start]=useTransition(),[feedback,setFeedback]=useState<{ok:boolean;message:string}|null>(null);
  const router=useRouter(),options=fiscalPaymentOptions(paymentMethod);
  const run=(emit:boolean)=>start(async()=>{
    setFeedback(null);
    try {setFeedback(emit?await emitNfce(id,form):await refreshNfceStatus(id));router.refresh();}
    catch {setFeedback({ok:false,message:"Não foi possível concluir. Atualize a página para conferir o status."});}
  });
  return <section className="space-y-4 border-t pt-5" aria-labelledby="emission-heading">
    <h2 id="emission-heading" className="font-semibold">NFC-e em homologação</h2>
    <p className="text-sm text-muted">Ambiente de testes da Focus NFe. Sem validade fiscal. Produção e cancelamento não estão habilitados.</p>
    {recordedPayment&&<p className="text-sm">Pagamento fiscal enviado: {FISCAL_PAYMENT_LABELS[recordedPayment as FiscalPaymentCode]??recordedPayment}.</p>}
    {status==="draft"?<>
      {!readiness.ready&&<div className="space-y-2"><p className="text-sm font-medium">Complete a configuração fiscal antes de emitir.</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">{readiness.missing.map((message,index)=><li key={index}>{message}</li>)}</ul>
        <div className="flex flex-wrap gap-4 text-sm"><Link className="focus-ring rounded text-primary underline" href="/admin/fiscal/configuracao">Configuração fiscal</Link><Link className="focus-ring rounded text-primary underline" href="/admin/produtos">Dados fiscais dos produtos</Link></div>
      </div>}
      <fieldset disabled={pending||!readiness.ready} className="space-y-4 disabled:opacity-60">
        <legend className="mb-3 text-sm font-medium">Detalhamento fiscal do pagamento</legend>
        {paymentMethod==="cash"?<p className="text-sm">Dinheiro — código fiscal 01.</p>:<>
          <div className="space-y-2"><Label htmlFor="fiscal-payment-code">Modalidade fiscal</Label><Select id="fiscal-payment-code" value={form.payment_code} onChange={e=>setForm({...form,payment_code:e.target.value})}><option value="">Selecione a modalidade</option>{options.map(o=><option key={o.code} value={o.code}>{o.label}</option>)}</Select></div>
          <div className="space-y-2"><Label htmlFor="fiscal-integration">Integração do pagamento</Label><Select id="fiscal-integration" value={form.integration_type} onChange={e=>setForm({...form,integration_type:e.target.value})}><option value="">Selecione como o pagamento ocorreu</option><option value="1">Integrado (TEF/comércio eletrônico)</option><option value="2">Não integrado (POS)</option></Select></div>
          <div className="grid gap-4 sm:grid-cols-2">{([['acquirer_cnpj','CNPJ da credenciadora'],['authorization','Autorização do pagamento'],['brand','Código da bandeira (se aplicável)']] as const).map(([key,label])=><div className="space-y-2" key={key}><Label htmlFor={`fiscal-${key}`}>{label}{key!=="brand"&&form.integration_type==="1"?" (obrigatório)":""}</Label><Input id={`fiscal-${key}`} value={form[key]} maxLength={key==="acquirer_cnpj"?14:key==="brand"?2:128} onChange={e=>setForm({...form,[key]:e.target.value})}/></div>)}</div>
        </>}
        <label className="flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" className="focus-ring mt-1 size-5 shrink-0 accent-primary" checked={form.simple_operation} onChange={e=>setForm({...form,simple_operation:e.target.checked})}/>Confirmo com o responsável fiscal: venda interna presencial, sem frete ou consumidor identificado, sem ST, IPI, serviços, combustíveis, medicamentos ou outras exigências especiais; mesma unidade comercial/tributável.</label>
        <label className="flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" className="focus-ring mt-1 size-5 shrink-0 accent-primary" checked={form.confirmed} onChange={e=>setForm({...form,confirmed:e.target.checked})}/>Esta emissão será enviada ao ambiente de homologação da Focus NFe e não terá validade fiscal.</label>
        <Button disabled={pending||!readiness.ready||!form.confirmed||!form.simple_operation||(paymentMethod!=="cash"&&(!form.payment_code||!form.integration_type))} onClick={()=>run(true)}>{pending?"Enviando…":"Emitir NFC-e em homologação"}</Button>
      </fieldset>
    </>:status!=="cancelled"&&<Button variant="outline" disabled={pending} onClick={()=>run(false)}>{pending?"Consultando…":"Atualizar status"}</Button>}
    {feedback&&<p role={feedback.ok?"status":"alert"} className={`text-sm ${feedback.ok?"text-success":"text-danger"}`}>{feedback.message}</p>}
  </section>;
}
