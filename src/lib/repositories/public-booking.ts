import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

export async function getPublicBookingPage(slug: string): Promise<Json | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_booking_page", { p_slug: slug });
  if (error) throw new Error(`Não foi possível carregar a página pública: ${error.message}`);
  return data;
}
