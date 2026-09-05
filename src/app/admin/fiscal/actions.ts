"use server";
import { revalidatePath } from "next/cache";
import { prepareFiscalDocument } from "@/lib/repositories/fiscal";
import { getProductFiscalSettings, saveBusinessFiscalSettings, saveProductFiscalSettings } from "@/lib/repositories/fiscal";

export async function readProductFiscalSettings(id:string) {return getProductFiscalSettings(id);}
export async function saveFiscalBusiness(input:unknown) {
  const result=await saveBusinessFiscalSettings(input);
  if(result.ok)revalidatePath("/admin/fiscal/configuracao");
  return result;
}
export async function saveFiscalProduct(id:string,input:unknown) {
  const result=await saveProductFiscalSettings(id,input);
  if(result.ok)revalidatePath("/admin/produtos");
  return result;
}

export async function prepareNfceForSale(saleId: string) {
  const result = await prepareFiscalDocument(saleId);
  if (result.ok) {
    revalidatePath("/admin/fiscal");
    revalidatePath(`/admin/vendas/${saleId}`);
  }
  return result;
}
