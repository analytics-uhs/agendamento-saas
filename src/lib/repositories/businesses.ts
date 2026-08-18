import { createClient } from "@/lib/supabase/server";
import type { BusinessRole } from "@/types/database";

export type CurrentBusiness = {
  id: string;
  name: string;
  slug: string;
  role: BusinessRole;
};

export async function getCurrentBusiness(userId: string): Promise<CurrentBusiness | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_members")
    .select("role, businesses!inner(id, name, slug, active)")
    .eq("user_id", userId)
    .eq("businesses.active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Não foi possível resolver o negócio atual: ${error.message}`);
  if (!data) return null;

  const business = data.businesses;
  return { id: business.id, name: business.name, slug: business.slug, role: data.role };
}
