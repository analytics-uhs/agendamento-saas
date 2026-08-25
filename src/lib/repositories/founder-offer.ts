import { getSupabaseEnvironment } from "@/lib/supabase/env";
import {
  FOUNDER_OFFER_FALLBACK,
  normalizeFounderOfferAvailability,
  type FounderOfferAvailability,
} from "@/lib/marketing";

const REVALIDATE_SECONDS = 60;

export async function getPublicFounderOffer(): Promise<FounderOfferAvailability> {
  try {
    const { url, key } = getSupabaseEnvironment();
    const response = await fetch(`${url}/rest/v1/rpc/get_public_founder_offer`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: "{}",
      next: { revalidate: REVALIDATE_SECONDS },
    });

    if (!response.ok) return FOUNDER_OFFER_FALLBACK;
    return normalizeFounderOfferAvailability(await response.json());
  } catch {
    return FOUNDER_OFFER_FALLBACK;
  }
}
