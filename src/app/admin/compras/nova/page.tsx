import { PurchaseEditor } from "@/components/admin/purchase-editor";
import { getPurchaseEditor } from "@/lib/repositories/purchases";
export default async function NewPurchasePage(){const data=await getPurchaseEditor();return <PurchaseEditor {...data}/>;}
