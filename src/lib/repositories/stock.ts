import "server-only";
import { requireBusinessModule } from "@/lib/auth/business-module";
import { createClient } from "@/lib/supabase/server";
import { catalogSearchExpression, validCatalogId, type Product, type ProductCategory } from "@/lib/product-catalog";
import { parseStockFilters, parseStockMovementInput, stockError, STOCK_HISTORY_PAGE_SIZE, STOCK_PAGE_SIZE, type StockBalance, type StockMovement, type StockFilters } from "@/lib/stock";
import type { ActionResult } from "@/types/business";

async function context(){const business=await requireBusinessModule("management");return {business,supabase:await createClient()};}
export async function getStockPage(input:Partial<Record<keyof StockFilters,unknown>>={}){
  const {business,supabase}=await context(); const filters=parseStockFilters(input);
  let query=supabase.from("product_stock_balances").select("product_id,category_id,name,sku,barcode,unit,minimum_stock,active,quantity,stock_status",{count:"exact"}).eq("business_id",business.id);
  if(filters.search) query=query.or(catalogSearchExpression(filters.search));
  if(filters.category) query=query.eq("category_id",filters.category);
  if(filters.status!=="all") query=query.eq("stock_status",filters.status);
  const result=await query.order("name").order("product_id").range((filters.page-1)*STOCK_PAGE_SIZE,filters.page*STOCK_PAGE_SIZE-1);
  if(result.error) throw new Error("Não foi possível carregar o estoque.");
  const categoriesResult=await supabase.from("product_categories").select("id,name,active").eq("business_id",business.id).order("name");
  const products:Product[]=[];
  for(let offset=0;;offset+=500){
    const batch=await supabase.from("products").select("id,category_id,name,sku,barcode,unit,cost_price,sale_price,minimum_stock,active").eq("business_id",business.id).order("name").order("id").range(offset,offset+499);
    if(batch.error) throw new Error("Não foi possível carregar o catálogo.");
    products.push(...batch.data); if(batch.data.length<500)break;
  }
  if(categoriesResult.error) throw new Error("Não foi possível carregar o catálogo.");
  let history:null|{product:Product;movements:StockMovement[];total:number;page:number}=null;
  if(filters.history){
    const product=products.find((item)=>item.id===filters.history);
    if(product){
      const movementResult=await supabase.from("stock_movements").select("id,product_id,movement_type,quantity_delta,unit_cost,reason,source_type,reversal_of_id,occurred_at,created_at",{count:"exact"}).eq("business_id",business.id).eq("product_id",product.id).order("occurred_at",{ascending:false}).order("created_at",{ascending:false}).order("id",{ascending:false}).range((filters.historyPage-1)*STOCK_HISTORY_PAGE_SIZE,filters.historyPage*STOCK_HISTORY_PAGE_SIZE-1);
      const ids=movementResult.data?.map(item=>item.id)??[];
      const reversedResult=ids.length ? await supabase.from("stock_movements").select("reversal_of_id").eq("business_id",business.id).eq("product_id",product.id).in("reversal_of_id",ids) : {data:[],error:null};
      if(movementResult.error||reversedResult.error) throw new Error("Não foi possível carregar o histórico.");
      const reversed=new Set(reversedResult.data.map((item)=>item.reversal_of_id));
      history={product,movements:movementResult.data.map((item)=>({...item,reversed:reversed.has(item.id)})) as StockMovement[],total:movementResult.count??0,page:filters.historyPage};
    }
  }
  return {balances:result.data as StockBalance[],categories:categoriesResult.data as ProductCategory[],products,total:result.count??0,filters,history};
}
export async function createStockMovement(input:unknown):Promise<ActionResult>{const {supabase}=await context();let value:ReturnType<typeof parseStockMovementInput>;try{value=parseStockMovementInput(input);}catch(error){return {ok:false,message:(error as Error).message};}
  const {error}=await supabase.rpc("create_admin_stock_movement",{p_product_id:value.product_id,p_movement_type:value.movement_type,p_quantity:value.quantity,p_unit_cost:value.unit_cost,p_reason:value.reason,p_occurred_at:value.occurred_at}); return error?{ok:false,message:stockError(error)}:{ok:true,message:"Movimentação registrada."};}
export async function reverseStockMovement(id:string,reason:unknown):Promise<ActionResult>{const {supabase}=await context();if(!validCatalogId(id))return {ok:false,message:"Movimentação inválida."};const value=typeof reason==="string"?reason.trim().slice(0,500):"";const {error}=await supabase.rpc("reverse_admin_stock_movement",{p_movement_id:id,p_reason:value||null});return error?{ok:false,message:stockError(error)}:{ok:true,message:"Movimentação estornada."};}
