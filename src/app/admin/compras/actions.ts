"use server";
import { revalidatePath } from "next/cache";
import { confirmPurchase,savePurchase } from "@/lib/repositories/purchases";
export async function savePurchaseDraft(id:string|null,input:unknown){const result=await savePurchase(id,input);if(result.ok&&result.data){revalidatePath("/admin/compras");revalidatePath(`/admin/compras/${result.data.id}`);}return result;}
export async function confirmPurchaseDraft(id:string|null,input:unknown){const result=await confirmPurchase(id,input);if(result.ok&&result.data){revalidatePath("/admin/compras");revalidatePath("/admin/estoque");revalidatePath(`/admin/compras/${result.data.id}`);}return result;}
