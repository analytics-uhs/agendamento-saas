import { parseCatalogDecimal, validCatalogId, type Product } from "@/lib/product-catalog";

export type PurchaseStatus="draft"|"confirmed";
export type PurchaseItemInput={product_id:string;quantity:string;unit_cost:string};
export type PurchaseInput={supplier_name:string;purchase_date:string;notes:string;items:PurchaseItemInput[]};
export type Purchase={id:string;status:PurchaseStatus;supplier_name:string|null;purchase_date:string;notes:string|null;total_amount:string|number;confirmed_at:string|null;created_at:string;item_count?:number};
export type PurchaseItem={id:string;product_id:string;quantity:string|number;unit_cost:string|number;product:{name:string;unit:string;active:boolean}|null};

function cleanText(value:unknown,max:number,label:string){if(typeof value!=="string")throw new Error(`Revise ${label}.`);const result=value.trim();if(result.length>max)throw new Error(`${label}: informe até ${max} caracteres.`);return result;}
export function parsePurchaseInput(input:unknown):PurchaseInput{
 if(!input||typeof input!=="object")throw new Error("Revise os dados da compra.");const data=input as Record<string,unknown>;
 if(typeof data.purchase_date!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(data.purchase_date)||Number.isNaN(Date.parse(`${data.purchase_date}T12:00:00Z`)))throw new Error("Informe uma data válida.");
 if(!Array.isArray(data.items)||data.items.length<1||data.items.length>200)throw new Error("Adicione ao menos um produto.");
 const seen=new Set<string>();const items=data.items.map((raw)=>{if(!raw||typeof raw!=="object")throw new Error("Revise os itens da compra.");const item=raw as Record<string,unknown>;if(!validCatalogId(item.product_id)||seen.has(item.product_id))throw new Error("Não repita o mesmo produto na compra.");seen.add(item.product_id);const quantity=parseCatalogDecimal(item.quantity,3)!,unit_cost=parseCatalogDecimal(item.unit_cost,2)!;if(Number(quantity)<=0)throw new Error("A quantidade deve ser maior que zero.");return {product_id:item.product_id,quantity,unit_cost};});
 return {supplier_name:cleanText(data.supplier_name,160,"Fornecedor"),purchase_date:data.purchase_date,notes:cleanText(data.notes,1000,"Observações"),items};
}
export function purchaseError(error:{code?:string;message?:string}){const message=error.message??"";if(message.includes("already_confirmed")||message.includes("confirmed_read_only"))return "Esta compra já foi confirmada e não pode ser alterada.";if(message.includes("cross_tenant")||message.includes("product_unavailable")||error.code==="23503")return "Um produto não está disponível para este negócio.";if(error.code==="23505")return "Não repita o mesmo produto na compra.";if(error.code==="42501")return "Você não tem acesso a esta operação.";return "Não foi possível salvar a compra. Revise os dados e tente novamente.";}
export function purchaseSubtotal(quantity:string|number,cost:string|number){return Number(quantity)*Number(cost);}
export function emptyPurchase(products:Product[]):PurchaseInput{return {supplier_name:"",purchase_date:new Date().toLocaleDateString("en-CA",{timeZone:"America/Sao_Paulo"}),notes:"",items:products.length?[{product_id:products[0].id,quantity:"1",unit_cost:products[0].cost_price==null?"0":String(products[0].cost_price).replace(".",",")}]:[]};}
