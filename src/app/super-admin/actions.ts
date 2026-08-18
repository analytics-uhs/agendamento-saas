"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { setPlatformBusinessActive } from "@/lib/repositories/super-admin";
import type { ActionResult } from "@/types/business";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function changePlatformBusinessStatus(_state: ActionResult, formData: FormData): Promise<ActionResult> {
  await requirePlatformAdmin();

  const businessId = String(formData.get("businessId") ?? "");
  const active = formData.get("active") === "true";
  if (!uuidPattern.test(businessId)) return { ok: false, message: "Negócio inválido." };

  try {
    await setPlatformBusinessActive(businessId, active);
    revalidatePath("/super-admin");
    revalidatePath("/super-admin/negocios");
    revalidatePath(`/super-admin/negocios/${businessId}`);
    revalidatePath("/admin", "layout");
    return { ok: true, message: active ? "Negócio ativado." : "Negócio inativado." };
  } catch {
    return { ok: false, message: `Não foi possível ${active ? "ativar" : "inativar"} o negócio agora.` };
  }
}
