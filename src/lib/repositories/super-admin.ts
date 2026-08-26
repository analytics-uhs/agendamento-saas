import "server-only";

import { createClient } from "@/lib/supabase/server";
import { parsePlatformBusinessDetail, parsePlatformBusinessPage, parsePlatformMetrics } from "@/lib/super-admin";
import { getBookingGroupCatalog } from "@/lib/repositories/booking-groups";
import type { BusinessStatusFilter } from "@/types/super-admin";

export async function isPlatformAdmin() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_current_user_platform_admin");
  if (error) throw new Error(`Não foi possível validar o acesso de plataforma: ${error.message}`);
  return data === true;
}

export async function getPlatformMetrics() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_platform_metrics");
  if (error) throw new Error(`Não foi possível carregar as métricas da plataforma: ${error.message}`);
  return parsePlatformMetrics(data);
}

export async function listPlatformBusinesses(input: { search: string; status: BusinessStatusFilter; page: number; pageSize?: number }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_platform_businesses", {
    p_search: input.search || null,
    p_active: input.status === "all" ? null : input.status === "active",
    p_page: input.page,
    p_page_size: input.pageSize ?? 20,
  });
  if (error) throw new Error(`Não foi possível carregar os negócios: ${error.message}`);
  return parsePlatformBusinessPage(data);
}

export async function getPlatformBusinessDetail(businessId: string) {
  const supabase = await createClient();
  const [{ data, error }, contactResult, groups] = await Promise.all([
    supabase.rpc("get_platform_business_detail", { p_business_id: businessId }),
    supabase.from("businesses").select("address, google_maps_url, instagram_url, facebook_url").eq("id", businessId).maybeSingle(),
    getBookingGroupCatalog(businessId),
  ]);
  if (error) throw new Error(`Não foi possível carregar o negócio: ${error.message}`);
  if (contactResult.error) throw new Error(`Não foi possível carregar os contatos do negócio: ${contactResult.error.message}`);
  const detail = parsePlatformBusinessDetail(data);
  if (!detail) return null;
  return {
    ...detail,
    groups: groups.map((group) => ({
      position: group.position,
      label: group.label,
      intentName: group.intentName,
      occupancyMode: group.occupancyMode,
      active: group.active,
      required: group.required,
      options: group.options.map((option) => ({
        id: option.id,
        name: option.name,
        durationMinutes: option.durationMinutes,
        active: option.active,
      })),
    })),
    business: {
      ...detail.business,
      address: contactResult.data?.address ?? null,
      googleMapsUrl: contactResult.data?.google_maps_url ?? null,
      instagramUrl: contactResult.data?.instagram_url ?? null,
      facebookUrl: contactResult.data?.facebook_url ?? null,
    },
  };
}

export async function setPlatformBusinessActive(businessId: string, active: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_platform_business_active", { p_business_id: businessId, p_active: active });
  if (error) throw new Error(`Não foi possível ${active ? "ativar" : "inativar"} o negócio: ${error.message}`);
}
