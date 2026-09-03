"use client";
import { useEffect,useRef,useState,useTransition } from "react";
import { useRouter } from "next/navigation";
import { History,Plus } from "lucide-react";
import { createMovement,reverseMovement } from "@/app/admin/estoque/actions";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input,Label,Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { STOCK_HISTORY_PAGE_SIZE,STOCK_MOVEMENT_TYPES,STOCK_PAGE_SIZE,emptyStockMovement,formatMovementType,formatStockQuantity,parseStockMovementInput,type StockBalance,type StockFilters,type StockMovement,type StockMovementInput } from "@/lib/stock";
import type { Product,ProductCategory } from "@/lib/product-catalog";

type Props={balances:StockBalance[];categories:ProductCategory[];products:Product[];total:number;filters:StockFilters;history:null|{product:Product;movements:StockMovement[];total:number;page:number}};
const statusMeta={normal:{label:"Normal",variant:"success" as const},low:{label:"Baixo",variant:"accent" as const},negative:{label:"Negativo",variant:"danger" as const}};

function StockDialog({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}){
 const content=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null;
  const dialog=content.current?.closest('[role="dialog"]');
  const overlay=dialog?.parentElement;
  const selector='button:not(:disabled), input:not(:disabled), select:not(:disabled), [href], [tabindex="0"]';
  const background:Array<{element:HTMLElement;inert:boolean;ariaHidden:string|null}>=[];
  let current=overlay;
  while(current?.parentElement){
   for(const sibling of Array.from(current.parentElement.children)){
    if(sibling===current||!(sibling instanceof HTMLElement))continue;
    background.push({element:sibling,inert:sibling.inert,ariaHidden:sibling.getAttribute("aria-hidden")});
    sibling.inert=true;
    sibling.setAttribute("aria-hidden","true");
   }
   current=current.parentElement;
  }
  (content.current?.querySelector("input, select, button") as HTMLElement|null)?.focus();
  function trap(event:KeyboardEvent){
   if(event.key!=="Tab"||!dialog)return;
   const items=Array.from(dialog.querySelectorAll<HTMLElement>(selector)).filter(item=>item.getClientRects().length>0);
   const first=items[0],last=items.at(-1);
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  }
  document.addEventListener("keydown",trap);
  return()=>{
   document.removeEventListener("keydown",trap);
   for(const item of background){item.element.inert=item.inert;if(item.ariaHidden===null)item.element.removeAttribute("aria-hidden");else item.element.setAttribute("aria-hidden",item.ariaHidden);}
   previous?.focus();
  };
 },[]);
 return <Modal title={title} onClose={onClose}><div ref={content}>{children}</div></Modal>;
}

function MovementDialog({products,onClose,onSaved}:{products:Product[];onClose:()=>void;onSaved:(message:string)=>void}){
 const [form,setForm]=useState<StockMovementInput>({...emptyStockMovement});const [error,setError]=useState("");const [pending,startTransition]=useTransition();const errorRef=useRef<HTMLParagraphElement>(null);useEffect(()=>{if(error)errorRef.current?.focus()},[error]);
 const needsReason=["adjustment_in","adjustment_out","loss"].includes(form.movement_type);
 function field(key:keyof StockMovementInput,value:string){setForm(current=>({...current,[key]:value}));}
 return <StockDialog title="Nova movimentação" onClose={onClose}><form className="space-y-4 p-4 sm:p-5" onSubmit={(event)=>{event.preventDefault();setError("");try{parseStockMovementInput(form)}catch(validation){setError((validation as Error).message);return}startTransition(async()=>{try{const result=await createMovement(form);if(result.ok)onSaved(result.message);else setError(result.message)}catch{setError("Não foi possível registrar agora. Tente novamente.")}})}}>
  <div className="space-y-2"><Label htmlFor="movement-product">Produto *</Label><Select id="movement-product" required value={form.product_id} onChange={e=>field("product_id",e.target.value)}><option value="">Selecione</option>{products.map(product=><option key={product.id} value={product.id}>{product.name}{!product.active?" (inativo)":""}</option>)}</Select></div>
  <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="movement-type">Tipo *</Label><Select id="movement-type" value={form.movement_type} onChange={e=>field("movement_type",e.target.value)}>{Object.entries(STOCK_MOVEMENT_TYPES).map(([value,label])=><option key={value} value={value}>{label}</option>)}</Select></div><div className="space-y-2"><Label htmlFor="movement-quantity">Quantidade *</Label><Input id="movement-quantity" required inputMode="decimal" placeholder="0,000" value={form.quantity} onChange={e=>field("quantity",e.target.value)}/><p className="text-xs text-muted">Informe um valor positivo; o tipo define entrada ou saída.</p></div>
  <div className="space-y-2"><Label htmlFor="movement-cost">Custo unitário (R$)</Label><Input id="movement-cost" inputMode="decimal" placeholder="Opcional" value={form.unit_cost} onChange={e=>field("unit_cost",e.target.value)}/></div><div className="space-y-2"><Label htmlFor="movement-date">Data e hora</Label><Input id="movement-date" type="datetime-local" value={form.occurred_at} onChange={e=>field("occurred_at",e.target.value)}/><p className="text-xs text-muted">Em branco, usa o momento atual.</p></div></div>
  <div className="space-y-2"><Label htmlFor="movement-reason">Motivo{needsReason?" *":""}</Label><Input id="movement-reason" required={needsReason} maxLength={500} placeholder={needsReason?"Ex.: Contagem física":"Opcional"} value={form.reason} onChange={e=>field("reason",e.target.value)}/></div>
  {error&&<p ref={errorRef} tabIndex={-1} role="alert" className="text-sm text-danger">{error}</p>}
  <div className="flex justify-end gap-2 border-t pt-4"><Button variant="outline" onClick={onClose} disabled={pending}>Cancelar</Button><Button type="submit" disabled={pending}>{pending?"Registrando…":"Registrar movimentação"}</Button></div>
 </form></StockDialog>
}

function HistoryDialog({history,onClose,onChanged}:{history:NonNullable<Props["history"]>;onClose:()=>void;onChanged:(message:string)=>void}){
 const router=useRouter();const [pending,startTransition]=useTransition();const [error,setError]=useState("");
 const params=(page:number)=>{const query=new URLSearchParams(window.location.search);query.set("history",history.product.id);query.set("historyPage",String(page));return `/admin/estoque?${query}`};
 return <StockDialog title={`Histórico · ${history.product.name}`} onClose={onClose}><div className="p-4 sm:p-5"><p className="mb-4 text-sm text-muted">Movimentações mais recentes primeiro. O histórico não pode ser editado ou excluído.</p>{error&&<p role="alert" className="mb-3 text-sm text-danger">{error}</p>}
  {!history.movements.length?<EmptyState>Nenhuma movimentação registrada.</EmptyState>:<ul className="divide-y border-y">{history.movements.map(movement=>{const positive=Number(movement.quantity_delta)>0;const canReverse=movement.movement_type!=="reversal"&&!movement.reversed;return <li key={movement.id} className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto]"><div><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{formatMovementType(movement.movement_type)}</p>{movement.reversed&&<Badge variant="neutral">Estornado</Badge>}</div><p className="mt-1 text-xs text-muted">{new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short",timeZone:"America/Sao_Paulo"}).format(new Date(movement.occurred_at))}{movement.reason?` · ${movement.reason}`:""}</p></div><div className="flex items-center gap-3"><span className={`font-semibold tabular-nums ${positive?"text-success":"text-danger"}`}>{positive?"+":""}{formatStockQuantity(movement.quantity_delta,history.product.unit)}</span>{canReverse&&<Button size="sm" variant="outline" disabled={pending} onClick={()=>{if(!window.confirm("O movimento original continuará no histórico. Será criada uma movimentação inversa."))return;startTransition(async()=>{const result=await reverseMovement(movement.id,"");if(result.ok)onChanged(result.message);else setError(result.message)})}}>Estornar</Button>}</div></li>})}</ul>}
  {history.total>STOCK_HISTORY_PAGE_SIZE&&<nav aria-label="Paginação do histórico" className="mt-4 flex items-center justify-between"><Button variant="outline" disabled={pending||history.page<=1} onClick={()=>router.push(params(history.page-1))}>Anterior</Button><span className="text-xs text-muted">Página {history.page}</span><Button variant="outline" disabled={pending||history.page*STOCK_HISTORY_PAGE_SIZE>=history.total} onClick={()=>router.push(params(history.page+1))}>Próxima</Button></nav>}
 </div></StockDialog>
}

export function StockPage({balances,categories,products,total,filters,history}:Props){const router=useRouter();const [showMovement,setShowMovement]=useState(false);const [feedback,setFeedback]=useState("");const [pending,startTransition]=useTransition();const categoryNames=new Map(categories.map(category=>[category.id,category.name]));
 function navigate(next:StockFilters){const params=new URLSearchParams({search:next.search,category:next.category,status:next.status,page:String(next.page)});startTransition(()=>router.push(`/admin/estoque?${params}`))}function saved(message:string){setShowMovement(false);setFeedback(message);router.refresh()}function closeHistory(){const params=new URLSearchParams(window.location.search);params.delete("history");params.delete("historyPage");router.push(`/admin/estoque?${params}`)}
 return <><PageHeader title="Estoque" description="Acompanhe os saldos e movimentações dos seus produtos." action={<Button onClick={()=>setShowMovement(true)} disabled={!products.length}><Plus className="h-4 w-4"/>Nova movimentação</Button>}/><div className="mt-6 space-y-4"><form className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_1fr_1fr_auto]" onSubmit={event=>{event.preventDefault();const data=new FormData(event.currentTarget);navigate({...filters,search:String(data.get("search")),category:String(data.get("category")),status:String(data.get("status")) as StockFilters["status"],page:1})}}><div className="space-y-2"><Label htmlFor="stock-search">Buscar produto</Label><Input id="stock-search" name="search" defaultValue={filters.search} placeholder="Nome, SKU ou código de barras"/></div><div className="space-y-2"><Label htmlFor="stock-category">Categoria</Label><Select id="stock-category" name="category" defaultValue={filters.category}><option value="">Todas</option>{categories.map(category=><option key={category.id} value={category.id}>{category.name}</option>)}</Select></div><div className="space-y-2"><Label htmlFor="stock-status">Situação</Label><Select id="stock-status" name="status" defaultValue={filters.status}><option value="all">Todas</option><option value="low">Estoque baixo</option><option value="negative">Negativo</option><option value="normal">Normal</option></Select></div><Button type="submit" variant="outline" disabled={pending}>Filtrar</Button></form>
 {feedback&&<p role="status" className="text-sm text-success">{feedback}</p>}{!products.length?<EmptyState size="lg"><p className="font-semibold text-foreground">Cadastre produtos primeiro</p><p className="mt-2">O saldo nasce de movimentações vinculadas ao catálogo.</p></EmptyState>:!balances.length?<EmptyState size="lg"><p className="font-semibold text-foreground">Nenhum produto encontrado</p><p className="mt-2">Revise a busca ou os filtros.</p></EmptyState>:<Card><ul className="divide-y">{balances.map(item=>{const meta=statusMeta[item.stock_status];return <li key={item.product_id} className="grid gap-3 p-4 md:grid-cols-[minmax(0,1.5fr)_minmax(8rem,.8fr)_minmax(7rem,.7fr)_auto] md:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="break-words text-sm font-semibold">{item.name}</h2>{!item.active&&<Badge variant="neutral">Inativo</Badge>}</div><p className="mt-1 text-xs text-muted">{item.category_id?categoryNames.get(item.category_id)??"Categoria indisponível":"Sem categoria"}{item.sku?` · SKU ${item.sku}`:""}</p></div><div><p className={`text-lg font-semibold tabular-nums ${item.stock_status==="negative"?"text-danger":""}`}>{formatStockQuantity(item.quantity,item.unit)}</p><p className="text-xs text-muted">Saldo atual</p></div><div><Badge variant={meta.variant}>{meta.label}</Badge><p className="mt-1 text-xs text-muted">Mínimo {formatStockQuantity(item.minimum_stock,item.unit)}</p></div><Button variant="outline" onClick={()=>router.push(`/admin/estoque?${new URLSearchParams({...Object.fromEntries(new URLSearchParams(window.location.search)),history:item.product_id,historyPage:"1"})}`)}><History className="h-4 w-4"/>Histórico</Button></li>})}</ul></Card>}
 {(total>STOCK_PAGE_SIZE||filters.page>1)&&<nav aria-label="Paginação do estoque" className="flex items-center justify-between"><Button variant="outline" disabled={pending||filters.page<=1} onClick={()=>navigate({...filters,page:filters.page-1})}>Anterior</Button><span className="text-xs text-muted">Página {filters.page}</span><Button variant="outline" disabled={pending||filters.page*STOCK_PAGE_SIZE>=total} onClick={()=>navigate({...filters,page:filters.page+1})}>Próxima</Button></nav>}</div>
 {showMovement&&<MovementDialog products={products} onClose={()=>setShowMovement(false)} onSaved={saved}/>} {history&&<HistoryDialog history={history} onClose={closeHistory} onChanged={message=>{setFeedback(message);router.refresh()}}/>}</>
}
