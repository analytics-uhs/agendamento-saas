import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { hashInviteToken, newInviteToken, validInviteToken } from "@/lib/auth/invite-session";
import { validCatalogId } from "@/lib/product-catalog";
import { normalizeSlug, validateSlug } from "@/lib/business-form";
import type { BusinessAccess, PublicInvite } from "@/lib/business-invites";

async function platform(businessId?: string) {
  await requirePlatformAdmin();
  if (businessId !== undefined && !validCatalogId(businessId)) throw Error("Negócio inválido.");
  return createClient();
}
export async function createProvisionedBusiness(name: string, slug: string, whatsapp: string) {
  const supabase = await platform();
  if (name.trim().length < 2 || name.trim().length > 120 || validateSlug(slug) || whatsapp.length > 30) throw Error("Dados inválidos.");
  const { data, error } = await supabase.rpc("create_platform_provisioned_business", { p_name: name.trim(), p_slug: normalizeSlug(slug), p_whatsapp: whatsapp.trim() || null });
  if (error) throw error;
  return data;
}
export async function getBusinessAccess(businessId: string) {
  const supabase = await platform(businessId);
  const { data, error } = await supabase.rpc("get_platform_business_access", { p_business_id: businessId });
  if (error) throw Error("Não foi possível carregar o acesso do cliente.");
  return data as unknown as BusinessAccess;
}
export async function generateBusinessInvite(businessId: string) {
  const supabase = await platform(businessId);
  const token = newInviteToken();
  const { error } = await supabase.rpc("generate_platform_business_invite", { p_business_id: businessId, p_token_hash: hashInviteToken(token) });
  if (error) throw Error(error.message.includes("invite_owner_exists") ? "invite_owner_exists" : "invite_failed");
  // Only returned in the immediate generation response, never persisted/logged.
  return `/convite/${token}`;
}
export async function revokeBusinessInvite(businessId: string) {
  const supabase = await platform(businessId);
  const { error } = await supabase.rpc("revoke_platform_business_invite", { p_business_id: businessId });
  if (error) throw Error("Não foi possível cancelar o convite.");
}
export async function inspectBusinessInvite(token: string | null): Promise<PublicInvite> {
  if (!validInviteToken(token)) return { status: "invalid" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_business_invite_public", { p_token_hash: hashInviteToken(token) });
  if (error) throw Error("Não foi possível consultar o convite. Tente novamente.");
  return data as unknown as PublicInvite;
}
export async function acceptBusinessInvite(token: string) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw Error("authentication_required");
  const { data, error } = await supabase.rpc("accept_business_invite", { p_token_hash: hashInviteToken(token) });
  if (error) throw Error(error.message.includes("invite_member_exists") ? "invite_member_exists" : error.message.includes("invite_expired") ? "invite_expired" : "invite_unavailable");
  return data;
}
