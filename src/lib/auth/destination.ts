import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/repositories/businesses";
import { isPlatformAdmin } from "@/lib/repositories/super-admin";

export async function resolveUserDestination(userId: string) {
  if (await isPlatformAdmin()) return "/super-admin";
  return await getCurrentBusiness(userId) ? "/admin" : "/onboarding";
}

export async function resolveAuthenticatedDestination() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) return null;
  return resolveUserDestination(userId);
}
