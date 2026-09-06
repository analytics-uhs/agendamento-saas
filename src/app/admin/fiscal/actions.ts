"use server";
import { revalidatePath } from "next/cache";
import { prepareFiscalDocument } from "@/lib/repositories/fiscal";
import { getProductFiscalSettings, saveBusinessFiscalSettings, saveProductFiscalSettings } from "@/lib/repositories/fiscal";
import { dispatchFiscalDocument } from "@/lib/repositories/fiscal-emission";

export async function emitNfce(id:string,input:unknown) {
  const result=await dispatchFiscalDocument(id,input,true);
  revalidatePath(`/admin/fiscal/${id}`); revalidatePath("/admin/fiscal");
  return result;
}
export async function refreshNfceStatus(id:string) {
  const result=await dispatchFiscalDocument(id,null,false);
  revalidatePath(`/admin/fiscal/${id}`); revalidatePath("/admin/fiscal");
  return result;
}

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
