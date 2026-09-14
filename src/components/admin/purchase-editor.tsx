"use client";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { confirmPurchaseDraft, savePurchaseDraft } from "@/app/admin/compras/actions";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/field";
import { emptyPurchase, parseEntryItem, parsePurchaseInput, purchaseSubtotal, type Purchase, type PurchaseInput, type PurchaseItem } from "@/lib/purchases";
import { formatCatalogBRL, type Product } from "@/lib/product-catalog";

export function PurchaseEditor({ purchase, items, products }: { purchase: Purchase | null; items: PurchaseItem[]; products: Product[] }) {
 const router = useRouter();
 const readonly = purchase?.status === "confirmed";
 const [form, setForm] = useState<PurchaseInput>(() => purchase ? {
   supplier_name: purchase.supplier_name ?? "", purchase_date: purchase.purchase_date, notes: purchase.notes ?? "",
   items: items.map(i => ({ product_id: i.product_id, quantity: String(i.quantity).replace(".", ","), unit_cost: String(i.unit_cost).replace(".", ",") })),
 } : emptyPurchase());
 const [search, setSearch] = useState("");
 const [candidate, setCandidate] = useState({ product_id: "", quantity: "1", unit_cost: "" });
 const [error, setError] = useState("");
 const [feedback, setFeedback] = useState("");
 const [pending, startTransition] = useTransition();
 const busy = useRef(false);
 const savedId = useRef(purchase?.id ?? null);
 const productMap = new Map(products.map(product => [product.id, product]));
 const selectedProduct = productMap.get(candidate.product_id);
 const availableProducts = products.filter(p => !form.items.some(i => i.product_id === p.id) && p.name.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR")));
 const subtotal = (item: PurchaseInput["items"][number]) => {
   const value = purchaseSubtotal(item.quantity.replace(",", "."), item.unit_cost.replace(",", "."));
   return Number.isFinite(value) && value >= 0 ? value : 0;
 };
 const total = form.items.reduce((sum, item) => sum + subtotal(item), 0);
 function field<K extends keyof PurchaseInput>(key: K, value: PurchaseInput[K]) { setForm(current => ({ ...current, [key]: value })); }
 function itemField(index: number, key: "quantity" | "unit_cost", value: string) {
   setForm(current => ({ ...current, items: current.items.map((item, i) => i === index ? { ...item, [key]: value } : item) }));
 }
 function addItem() {
   setError("");
   try {
     const item = parseEntryItem(candidate);
     if (form.items.some(i => i.product_id === item.product_id)) throw new Error("Este produto já está na entrada.");
     field("items", [...form.items, item]);
     setCandidate({ product_id: "", quantity: "1", unit_cost: "" });
     setSearch(""); setFeedback("Produto adicionado. Você pode incluir o próximo.");
     document.getElementById("entry-search")?.focus();
   } catch (validation) { setError((validation as Error).message); }
 }
 function submit(confirm: boolean) {
   if (busy.current || readonly) return;
   setError(""); setFeedback("");
   try {
     if (candidate.product_id) throw new Error("Adicione o produto selecionado antes de confirmar.");
     form.items.forEach(parseEntryItem);
     parsePurchaseInput(form);
   } catch (validation) { setError((validation as Error).message); return; }
   busy.current = true;
   startTransition(async () => {
     let completed = false;
     try {
       // Retain a stable draft before confirmation; retries target the same entry.
       if (!savedId.current) {
         const draft = await savePurchaseDraft(null, form);
         if (!draft.ok || !draft.data) { setError(draft.message); return; }
         savedId.current = draft.data.id;
         window.history.replaceState(null, "", `/admin/compras/${draft.data.id}`);
         if (!confirm) { router.push(`/admin/compras/${draft.data.id}`); router.refresh(); setFeedback("Rascunho salvo."); return; }
       }
       const result = confirm ? await confirmPurchaseDraft(savedId.current, form) : await savePurchaseDraft(savedId.current, form);
       if (!result.ok || !result.data) { setError(result.message); return; }
       setFeedback(confirm ? "Entrada confirmada. Estoque atualizado." : "Rascunho salvo.");
       // Keep confirmation locked until navigation replaces the editor.
       completed = confirm;
       router.push(`/admin/compras/${result.data.id}`); router.refresh();
     } catch { setError("Não foi possível salvar agora. Tente novamente."); }
     finally { if (!completed) busy.current = false; }
   });
 }
 if(readonly)return <><PageHeader title="Detalhe da entrada" description="Esta entrada já foi adicionada ao estoque." action={<Badge variant="success">Confirmada</Badge>}/><Card padding="md" className="mt-6 space-y-5"><dl className="grid gap-4 sm:grid-cols-3"><div><dt className="text-xs text-muted">Data</dt><dd className="font-medium">{new Intl.DateTimeFormat("pt-BR").format(new Date(`${purchase.purchase_date}T12:00:00`))}</dd></div><div><dt className="text-xs text-muted">Fornecedor</dt><dd className="font-medium">{purchase.supplier_name||"Não informado"}</dd></div><div><dt className="text-xs text-muted">Total</dt><dd className="font-semibold">{formatCatalogBRL(purchase.total_amount)}</dd></div></dl>{purchase.notes&&<div><p className="text-xs text-muted">Observações</p><p className="text-sm">{purchase.notes}</p></div>}<ul className="divide-y border-y">{items.map(item=><li key={item.id} className="grid gap-1 py-3 sm:grid-cols-[minmax(0,1fr)_7rem_8rem_8rem]"><span className="font-medium">{item.product?.name??"Produto indisponível"}{item.product&&!item.product.active?" (inativo)":""}</span><span>{item.quantity} {item.product?.unit}</span><span>{formatCatalogBRL(item.unit_cost)}</span><span className="font-semibold">{formatCatalogBRL(purchaseSubtotal(item.quantity,item.unit_cost))}</span></li>)}</ul><div className="flex justify-end"><Link href="/admin/compras" className="focus-ring rounded-xl border px-4 py-2.5 text-sm font-semibold hover:bg-surface">Voltar para entradas</Link></div></Card></>;
 return <>
   <PageHeader title={purchase ? "Editar entrada" : "Nova entrada"} description="Adicione os produtos recebidos e confirme para atualizar o estoque." />
   <Card padding="md" className="mt-6">
     <form className="space-y-6" onSubmit={event => { event.preventDefault(); submit(true); }}>
       <fieldset disabled={pending} className="space-y-6">
         <div className="max-w-xs space-y-2"><Label htmlFor="purchase-date">Data</Label><Input id="purchase-date" type="date" required value={form.purchase_date} onChange={e => field("purchase_date", e.target.value)} /></div>
         <section aria-labelledby="entry-add-title" className="space-y-3">
           <h2 id="entry-add-title" className="font-semibold">Adicionar produto</h2>
           <div className="space-y-2"><Label htmlFor="entry-search">Buscar produto</Label><Input id="entry-search" type="search" placeholder="Nome do produto" value={search} onChange={e => { setSearch(e.target.value); setCandidate(c => ({ ...c, product_id: "" })); }} onKeyDown={e => { if (e.key === "Enter") e.preventDefault(); }} /></div>
           <div className="space-y-2"><Label htmlFor="entry-product">Produto</Label><Select id="entry-product" value={candidate.product_id} onChange={e => { const p = productMap.get(e.target.value); setCandidate({ product_id: e.target.value, quantity: "1", unit_cost: p?.cost_price == null ? "" : String(p.cost_price).replace(".", ",") }); }}>
             <option value="">Selecione um produto</option>{availableProducts.map(p => <option key={p.id} value={p.id}>{p.name}{!p.active ? " (inativo)" : ""}</option>)}
           </Select>{!availableProducts.length && <p className="text-sm text-muted">{products.length ? "Nenhum produto disponível nesta busca. Os itens já adicionados podem ser editados abaixo." : "Cadastre um produto para registrar uma entrada."}</p>}
           {selectedProduct?.cost_price != null && <p className="text-sm text-muted">Custo atual: {formatCatalogBRL(selectedProduct.cost_price)}</p>}</div>
           <div className="grid gap-3 sm:grid-cols-2">
             <div className="space-y-2"><Label htmlFor="entry-quantity">Quantidade (un)</Label><Input id="entry-quantity" inputMode="numeric" value={candidate.quantity} onChange={e => setCandidate(c => ({ ...c, quantity: e.target.value }))} /></div>
             <div className="space-y-2"><Label htmlFor="entry-cost">Custo unitário (R$)</Label><Input id="entry-cost" inputMode="decimal" value={candidate.unit_cost} onChange={e => setCandidate(c => ({ ...c, unit_cost: e.target.value }))} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }} /></div>
           </div>
           <Button variant="outline" disabled={!candidate.product_id} onClick={addItem}><Plus className="h-4 w-4" />Adicionar</Button>
         </section>
         <section aria-labelledby="purchase-items">
           <h2 id="purchase-items" className="font-semibold">Itens da entrada</h2>
           {!form.items.length ? <p className="mt-3 text-sm text-muted">Nenhum produto adicionado.</p> : <ul className="mt-3 divide-y border-y">{form.items.map((item, index) => {
             const name = productMap.get(item.product_id)?.name ?? items.find(i => i.product_id === item.product_id)?.product?.name ?? "Produto indisponível";
             return <li key={item.product_id} className="space-y-3 py-4">
               <div className="flex items-center justify-between gap-3"><p className="min-w-0 break-words font-medium">{name}</p><Button size="icon" variant="ghost" aria-label={`Remover ${name}`} onClick={() => field("items", form.items.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button></div>
               <div className="grid gap-3 sm:grid-cols-2">
                 <div className="space-y-2"><Label htmlFor={`purchase-quantity-${index}`}>Quantidade (un)</Label><Input id={`purchase-quantity-${index}`} aria-label={`Quantidade de ${name}`} inputMode="numeric" required value={item.quantity} onChange={e => itemField(index, "quantity", e.target.value)} /></div>
                 <div className="space-y-2"><Label htmlFor={`purchase-cost-${index}`}>Custo unitário (R$)</Label><Input id={`purchase-cost-${index}`} aria-label={`Custo unitário de ${name}`} inputMode="decimal" required value={item.unit_cost} onChange={e => itemField(index, "unit_cost", e.target.value)} /></div>
               </div>
               <p className="text-right font-semibold tabular-nums">{formatCatalogBRL(subtotal(item))}</p>
             </li>;
           })}</ul>}
         </section>
         <div><p className="text-sm text-muted">Total da entrada</p><p className="text-2xl font-semibold tabular-nums">{formatCatalogBRL(total)}</p></div>
         <div className="space-y-2"><Label htmlFor="purchase-notes">Observação (opcional)</Label><textarea id="purchase-notes" maxLength={1000} rows={2} className="focus-ring w-full rounded-xl border bg-background px-3 py-2 text-sm" value={form.notes} onChange={e => field("notes", e.target.value)} /></div>
         <details><summary className="focus-ring cursor-pointer rounded text-sm text-muted">Mais opções</summary><div className="mt-3 space-y-2"><Label htmlFor="purchase-supplier">Fornecedor (opcional)</Label><Input id="purchase-supplier" maxLength={160} value={form.supplier_name} onChange={e => field("supplier_name", e.target.value)} /></div></details>
         <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:justify-end"><Button variant="ghost" onClick={() => submit(false)}>Salvar rascunho</Button><Button type="submit" disabled={!form.items.length}>{pending ? "Salvando…" : "Confirmar entrada"}</Button></div>
       </fieldset>
       {error && <p role="alert" className="text-sm text-danger">{error}</p>}
       {feedback && <p role="status" className="text-sm text-success">{feedback}</p>}
     </form>
   </Card>
 </>;
}
