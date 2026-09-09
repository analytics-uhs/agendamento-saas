import "server-only";
import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { requireCurrentBusiness } from "@/lib/repositories/businesses";
import { createClient } from "@/lib/supabase/server";
import { validCatalogId } from "@/lib/product-catalog";

/** Explicit configuration-only context. Never changes membership/current-business globally. */
export async function requireConfigurationBusiness(platformBusinessId?: string) {
  if (platformBusinessId === undefined) return requireCurrentBusiness();
  await requirePlatformAdmin();
  if (!validCatalogId(platformBusinessId)) throw Error("Negócio inválido.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("authorize_platform_business_configuration", { p_business_id: platformBusinessId });
  if (error || !data) throw Error("Configuração não autorizada.");
  return data as { id: string; name: string; slug: string; active: boolean };
}
