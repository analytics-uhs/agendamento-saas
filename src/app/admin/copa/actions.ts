"use server";
import { revalidatePath } from "next/cache";
import { openCopa, mutateCopa } from "@/lib/repositories/copa";
import type { CopaType } from "@/lib/copa";
export async function openCopaSale(id: string, type: CopaType, name: string) {
  const result = await openCopa(id, type, name);
  if (result.ok) revalidatePath("/admin/copa");
  return result;
}
export async function updateCopaSale(id: string, type: CopaType, revision: number, operation: { product: string; quantity: number } | { payment: string }) {
  const result = await mutateCopa(id, type, revision, operation);
  revalidatePath("/admin/copa", "layout");
  revalidatePath("/admin/vendas");
  revalidatePath(`/admin/vendas/${id}`);
  if (result.ok && "payment" in operation) { revalidatePath("/admin/estoque"); revalidatePath("/admin/financeiro"); }
  return result;
}
