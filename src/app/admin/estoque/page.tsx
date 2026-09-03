import { StockPage } from "@/components/admin/stock-page";
import { getStockPage } from "@/lib/repositories/stock";
export default async function AdminStockPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){const params=await searchParams;const value=(key:string)=>typeof params[key]==="string"?params[key] as string:"";const data=await getStockPage({search:value("search"),category:value("category"),status:value("status"),page:value("page"),history:value("history"),historyPage:value("historyPage")});return <StockPage {...data}/>;}
