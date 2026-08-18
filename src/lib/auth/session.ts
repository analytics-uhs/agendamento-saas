import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireAuthenticatedUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  if (error || !userId) redirect("/");

  return { id: userId, email: typeof data.claims.email === "string" ? data.claims.email : null };
}
