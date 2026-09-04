import { notFound } from "next/navigation";
import { PurchaseEditor } from "@/components/admin/purchase-editor";
import { getPurchaseEditor } from "@/lib/repositories/purchases";
export default async function PurchasePage({params}:{params:Promise<{id:string}>}){const {id}=await params;const data=await getPurchaseEditor(id);if(!data.purchase)notFound();return <PurchaseEditor {...data}/>;}
