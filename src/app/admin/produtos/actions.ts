"use server";
import { revalidatePath } from "next/cache";
import { saveCatalogCategory, saveCatalogProduct, setCatalogProductActive } from "@/lib/repositories/products";

export async function saveProduct(id: string | null, input: unknown) {
  const result = await saveCatalogProduct(id, input);
  if (result.ok) revalidatePath("/admin/produtos");
  return result;
}
export async function saveCategory(id: string | null, input: unknown) {
  const result = await saveCatalogCategory(id, input);
  if (result.ok) revalidatePath("/admin/produtos");
  return result;
}
export async function setProductActive(id: string, active: boolean) {
  const result = await setCatalogProductActive(id, active);
  if (result.ok) revalidatePath("/admin/produtos");
  return result;
}
