import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as purchases from "./purchases";
import * as catalog from "./product-catalog";

type Node = { type: string; props: Record<string, unknown> };
function nodes(value: unknown): Node[] {
 if (Array.isArray(value)) return value.flatMap(nodes);
 if (!value || typeof value !== "object" || !("props" in value)) return [];
 const node = value as Node;
 return [node, ...nodes(node.props.children)];
}
function text(value: unknown): string {
 if (Array.isArray(value)) return value.map(text).join("");
 if (typeof value === "string") return value;
 return value && typeof value === "object" && "props" in value ? text((value as Node).props.children) : "";
}
const products = [
 {id:"de620000-0000-4000-8000-000000000001",name:"Heineken",cost_price:5.2},
 {id:"de620000-0000-4000-8000-000000000002",name:"Água",cost_price:1.8},
].map(p=>({...p,unit:"UN",active:true,category_id:null,sku:null,barcode:null,sale_price:10,minimum_stock:0})) as catalog.Product[];
function editor(confirmed = false, failFirst = false) {
 const states: unknown[] = []; let cursor=0; let pending: Promise<void>|undefined;
 const calls: {name:string;id:unknown;input:unknown}[]=[];
 let attempts=0, focused=false;
 function state(initial: unknown) {
   const i=cursor++;
   if (!(i in states)) states[i]=typeof initial==="function"?initial():initial;
   return [states[i], (next:unknown)=>{states[i]=typeof next==="function"?next(states[i]):next;}];
 }
 const dependencies: Record<string, unknown> = {
   react:{useState:state,useRef:(initial:unknown)=>state({current:initial})[0],useTransition:()=>[false,(fn:()=>Promise<void>)=>{pending=fn();}]},
   "react/jsx-runtime":{jsx:(type:string,props:Node["props"])=>({type,props}),jsxs:(type:string,props:Node["props"])=>({type,props})},
   "next/link":{default:"Link"},"next/navigation":{useRouter:()=>({push(){},refresh(){}})},
   "lucide-react":{Plus:"Plus",Trash2:"Trash2"},
   "@/components/ui/page-header":{PageHeader:"PageHeader"},"@/components/ui/card":{Card:"Card"},
   "@/components/ui/badge":{Badge:"Badge"},"@/components/ui/button":{Button:"Button"},
   "@/components/ui/field":{Input:"Input",Label:"Label",Select:"Select"},
   "@/lib/purchases":purchases,"@/lib/product-catalog":catalog,
   "@/app/admin/compras/actions":{
     savePurchaseDraft:async(id:unknown,input:unknown)=>{calls.push({name:"save",id,input});return {ok:true,data:{id:"saved-entry"}};},
     confirmPurchaseDraft:async(id:unknown,input:unknown)=>{calls.push({name:"confirm",id,input});return failFirst&&attempts++===0?{ok:false,message:"Tente novamente."}:{ok:true,data:{id:"saved-entry"}};},
   },
 };
 const exports:Record<string,unknown>={};
 const code=ts.transpileModule(readFileSync("src/components/admin/purchase-editor.tsx","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 runInNewContext(code,{exports,require:(id:string)=>{if(!(id in dependencies))throw Error(id);return dependencies[id];},document:{getElementById:()=>({focus(){focused=true;}})},window:{history:{replaceState(){}}}});
 const render=()=>{cursor=0;return nodes((exports.PurchaseEditor as (props:unknown)=>unknown)({purchase:confirmed?{id:"done",status:"confirmed",purchase_date:"2026-09-14",total_amount:10}:null,items:[],products}));};
 const event=(id:string,value:string)=>{const n=render().find(n=>n.props.id===id);assert.ok(n);(n.props.onChange as (e:unknown)=>void)({target:{value}});};
 const add=(index:number,quantity:string)=>{event("entry-product",products[index].id);event("entry-quantity",quantity);const n=render().find(n=>n.type==="Button"&&text(n.props.children)==="Adicionar");assert.ok(n);(n.props.onClick as ()=>void)();};
 const submit=()=>{const n=render().find(n=>n.type==="form");assert.ok(n);(n.props.onSubmit as (e:unknown)=>void)({preventDefault(){}});};
 return {render,event,add,submit,calls,finish:async()=>pending,focused:()=>focused};
}
test("entry editor adds several products, clears selection, edits costs/quantities and removes items",()=>{
 const ui=editor();
 assert.match(text(ui.render()),/Nenhum produto adicionado/);
 ui.event("entry-product",products[0].id);
 assert.match(text(ui.render()),/Custo atual/);
 ui.add(0,"24");
 assert.equal(ui.render().find(n=>n.props.id==="entry-product")?.props.value,"");
 assert.equal(ui.focused(),true);
 ui.add(1,"12");
 assert.match(text(ui.render()),/146,40/);
 ui.event("purchase-quantity-0","1"); ui.event("purchase-cost-0","2,00");
 assert.match(text(ui.render()),/23,60/);
 const remove=ui.render().find(n=>n.props["aria-label"]==="Remover Água")!;
 (remove.props.onClick as ()=>void)();
 assert.equal(ui.render().filter(n=>String(n.props.id).startsWith("purchase-quantity-")).length,1);
});
test("invalid quantity/cost does not add items or submit an entry",()=>{
 const ui=editor();ui.add(0,"1.5");
 assert.ok(ui.render().some(n=>n.props.role==="alert"));
 assert.equal(ui.render().filter(n=>String(n.props.id).startsWith("purchase-quantity-")).length,0);
 ui.event("entry-quantity","1");ui.event("entry-cost","-5");
 ui.submit();assert.equal(ui.calls.length,0);
});
test("confirmation uses one stable draft and blocks a double submit",async()=>{
 const ui=editor();ui.add(0,"24");ui.add(1,"12");
 ui.submit();ui.submit();await ui.finish();
 assert.deepEqual(ui.calls.map(c=>[c.name,c.id]),[["save",null],["confirm","saved-entry"]]);
 assert.equal((ui.calls[1].input as purchases.PurchaseInput).items.length,2);
 ui.submit();await ui.finish();assert.equal(ui.calls.length,2);
 assert.match(text(ui.render()),/Estoque atualizado/);
});
test("failed confirmation retries the same persisted entry, never a new draft",async()=>{
 const ui=editor(false,true);ui.add(0,"1");
 ui.submit();await ui.finish();
 ui.submit();await ui.finish();
 assert.deepEqual(ui.calls.map(c=>[c.name,c.id]),[["save",null],["confirm","saved-entry"],["confirm","saved-entry"]]);
});
test("confirmed entry is read-only and Stock links to the same entry editor",()=>{
 const ui=editor(true);
 assert.equal(ui.render().filter(n=>n.type==="form").length,0);
 const stock=readFileSync("src/components/admin/stock-page.tsx","utf8");
 assert.match(stock,/href="\/admin\/compras\/nova"[^]*?Nova entrada/);
});
