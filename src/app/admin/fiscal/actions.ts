"use server";
import { revalidatePath } from "next/cache";
import { prepareFiscalDocument } from "@/lib/repositories/fiscal";

export async function prepareNfceForSale(saleId: string) {
  const result = await prepareFiscalDocument(saleId);
  if (result.ok) {
    revalidatePath("/admin/fiscal");
    revalidatePath(`/admin/vendas/${saleId}`);
  }
  return result;
}
