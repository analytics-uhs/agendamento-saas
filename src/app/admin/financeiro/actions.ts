"use server";
import { revalidatePath } from "next/cache";
import { createFinancialEntry } from "@/lib/repositories/financial";
export async function createManualFinancialEntry(input: unknown) {
  const result = await createFinancialEntry(input);
  if (result.ok) revalidatePath("/admin/financeiro");
  return result;
}
