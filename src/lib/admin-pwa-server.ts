import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getPalette } from "@/lib/palettes";
import type { VisualThemePreference } from "@/types/business";

export async function getAuthenticatedAdminPwaContext() {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || !userId) return null;

  const { data: membership, error: membershipError } = await supabase
    .from("business_members")
    .select("business_id, businesses!inner(name, slug, logo_url, updated_at)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (membershipError || !membership) return null;

  const { data: settings, error: settingsError } = await supabase
    .from("business_settings")
    .select("palette, theme_preference")
    .eq("business_id", membership.business_id)
    .single();
  if (settingsError || !settings) return null;

  const paletteValue = settings.palette;
  const paletteId = paletteValue && typeof paletteValue === "object" && !Array.isArray(paletteValue) && typeof paletteValue.id === "string"
    ? paletteValue.id
    : "original";
  const business = membership.businesses;
  return {
    businessId: membership.business_id,
    name: business.name,
    slug: business.slug,
    logoUrl: business.logo_url,
    iconVersion: business.updated_at,
    palette: getPalette(paletteId),
    theme: (settings.theme_preference === "dark" ? "dark" : "light") as VisualThemePreference,
  };
}
