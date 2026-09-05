"use server";
import { revalidatePath } from "next/cache";
import { createFinancialEntry, getBookingFinancialEntry } from "@/lib/repositories/financial";
export async function createManualFinancialEntry(input: unknown) {
  const result = await createFinancialEntry(input);
  if (result.ok) revalidatePath("/admin/financeiro");
  return result;
}
export async function registerAppointmentPayment(target: unknown, input: unknown) {
  const result = await createFinancialEntry(input, target);
  if (result.ok) revalidatePath("/admin/financeiro");
  return result;
}
export async function readBookingPayment(target: unknown) {
  return getBookingFinancialEntry(target);
}
