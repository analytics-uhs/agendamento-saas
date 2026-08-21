import "server-only";

import { createClient } from "@/lib/supabase/server";

export async function getOwnProfile(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", userId)
    .maybeSingle();
  return data;
}
