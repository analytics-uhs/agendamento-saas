import {notFound} from "next/navigation";import {SaleEditor} from "@/components/admin/sale-editor";import {getSaleEditor} from "@/lib/repositories/sales";
import { SaleFiscal } from "@/components/admin/sale-fiscal";
export default async function SalePage({params}:{params:Promise<{id:string}>}){const {id}=await params;const data=await getSaleEditor(id);if(!data.sale)notFound();return <><SaleEditor {...data}/>{data.sale.status==="completed" && <SaleFiscal saleId={id}/>}</>;}
