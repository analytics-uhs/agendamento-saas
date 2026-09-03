import "server-only";
import { createClient } from "@/lib/supabase/server";
import { parseBusinessModules } from "@/lib/business-modules";

/** Call with the server-resolved tenant. Session RLS is still the final boundary. */
export async function getBusinessModules(businessId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("business_modules")
    .select("module, enabled").eq("business_id", businessId);
  if (error) throw new Error("Não foi possível carregar os módulos do negócio.");
  return parseBusinessModules(data ?? []);
}
