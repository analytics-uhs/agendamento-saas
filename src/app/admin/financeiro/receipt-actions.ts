"use server";
import { revalidatePath } from "next/cache";
import { defineBookingTotal, readOriginReceipts, registerOriginReceipt } from "@/lib/repositories/receipts";
export async function readReceipts(target: unknown) { return readOriginReceipts(target); }
export async function setBookingTotal(target: unknown, total: unknown) {
  const result = await defineBookingTotal(target, total);
  if (result.ok) { revalidatePath("/admin/agenda"); revalidatePath("/admin/copa"); }
  return result;
}
export async function registerReceipt(target: unknown, input: unknown) {
  const result = await registerOriginReceipt(target, input);
  if (result.ok) { revalidatePath("/admin/financeiro"); revalidatePath("/admin/copa"); }
  return result;
}
