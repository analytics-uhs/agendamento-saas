"use server";

import { requireAuthenticatedUser } from "@/lib/auth/session";
import { validateBusinessForm, toOnboardingPayload } from "@/lib/business-form";
import { getCurrentBusiness } from "@/lib/repositories/businesses";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult, BusinessForm } from "@/types/business";
import type { Json } from "@/types/database";

export async function completeOnboarding(form: BusinessForm): Promise<ActionResult<{ businessId: string; slug: string }>> {
  const user = await requireAuthenticatedUser();
  if (await getCurrentBusiness(user.id)) return { ok: false, message: "Seu estabelecimento já foi criado." };
  const validationError = validateBusinessForm(form);
  if (validationError) return { ok: false, message: validationError };

  const payload = toOnboardingPayload(form);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("complete_business_onboarding", { p_payload: payload as unknown as Json });
  if (error) {
    const duplicate = error.code === "23505" || error.message.includes("businesses_slug_unique");
    return { ok: false, message: duplicate ? "Esta URL já está em uso. Escolha outra." : "Não foi possível concluir a configuração. Tente novamente." };
  }
  return { ok: true, message: "Estabelecimento criado.", data: { businessId: data, slug: payload.slug } };
}
