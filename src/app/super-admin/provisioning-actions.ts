"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createProvisionedBusiness, generateBusinessInvite, revokeBusinessInvite } from "@/lib/repositories/business-invites";
import { inviteError } from "@/lib/business-invites";
import type { ActionResult } from "@/types/business";

export async function provisionBusiness(_state: ActionResult, form: FormData): Promise<ActionResult> {
  let id: string;
  try { id = await createProvisionedBusiness(String(form.get("name") ?? ""), String(form.get("slug") ?? ""), String(form.get("whatsapp") ?? "")); }
  catch { return { ok: false, message: "Não foi possível criar. Revise os dados e verifique se o link já está em uso." }; }
  revalidatePath("/super-admin/negocios");
  redirect(`/super-admin/negocios/${id}`);
}
export async function generateOwnerInvite(businessId: string): Promise<ActionResult<{ path: string }>> {
  try {
    const path = await generateBusinessInvite(businessId);
    revalidatePath(`/super-admin/negocios/${businessId}`);
    return { ok: true, message: "Copie este link agora. Ao sair desta página, ele não poderá ser recuperado.", data: { path } };
  } catch (error) { return { ok: false, message: inviteError(error instanceof Error ? error.message : "") }; }
}
export async function revokeOwnerInvite(businessId: string): Promise<ActionResult> {
  try { await revokeBusinessInvite(businessId); revalidatePath(`/super-admin/negocios/${businessId}`); return { ok: true, message: "Convite cancelado." }; }
  catch { return { ok: false, message: "Não foi possível cancelar. Tente novamente." }; }
}
