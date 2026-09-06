import "server-only";
import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { createClient } from "@/lib/supabase/server";
import { isBusinessModule, parseBusinessModules } from "@/lib/business-modules";
import { validCatalogId } from "@/lib/product-catalog";

export async function getPlatformBusinessModules(businessId: string) {
  await requirePlatformAdmin();
  if (!validCatalogId(businessId)) throw new Error("Negócio inválido.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_platform_business_modules", { p_business_id: businessId });
  if (error || !Array.isArray(data)) throw new Error("Não foi possível carregar os módulos.");
  return parseBusinessModules(data as { module: unknown; enabled: unknown }[]);
}

export async function setPlatformBusinessModule(businessId: string, module: unknown, enabled: unknown) {
  await requirePlatformAdmin();
  if (!validCatalogId(businessId) || !isBusinessModule(module) || typeof enabled !== "boolean") {
    throw new Error("Configuração de módulo inválida.");
  }
  if (module === "scheduling" && !enabled) throw new Error("Agenda não pode ser desativada nesta versão.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_platform_business_module_enabled", {
    p_business_id: businessId, p_module: module, p_enabled: enabled,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)
    || data.business_id !== businessId || data.module !== module || typeof data.enabled !== "boolean"
    || typeof data.business_name !== "string") throw new Error("Não foi possível atualizar o módulo.");
  return { businessName: data.business_name, module, enabled: data.enabled };
}
