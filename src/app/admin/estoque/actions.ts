"use server";
import { revalidatePath } from "next/cache";
import { createStockMovement,reverseStockMovement } from "@/lib/repositories/stock";
export async function createMovement(input:unknown){const result=await createStockMovement(input);if(result.ok)revalidatePath("/admin/estoque");return result;}
export async function reverseMovement(id:string,reason:string){const result=await reverseStockMovement(id,reason);if(result.ok)revalidatePath("/admin/estoque");return result;}
