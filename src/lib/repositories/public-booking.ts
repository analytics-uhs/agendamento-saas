import { createClient } from "@/lib/supabase/server";
import { getPalette } from "@/lib/palettes";
import { displayEndTime } from "@/lib/time-of-day";
import type { Json } from "@/types/database";
import type { PublicBookingData } from "@/types/public-booking";

function object(value: Json | undefined): Record<string, Json | undefined> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

export function parsePublicBookingPage(value: Json | null): PublicBookingData | null {
  const root = object(value ?? undefined);
  const business = object(root?.business);
  const settings = object(root?.settings);
  if (!root || !business || !settings || typeof business.id !== "string" || typeof business.name !== "string" || typeof business.slug !== "string") return null;
  if (!(["fixed", "fixed_multiple", "group_2"] as const).includes(settings.duration_mode as never)) return null;

  const groups = Array.isArray(root.groups) ? root.groups.flatMap((rawGroup) => {
    const group = object(rawGroup);
    if (!group || (group.position !== 1 && group.position !== 2) || typeof group.label !== "string") return [];
    const position: 1 | 2 = group.position;
    const options = Array.isArray(group.options) ? group.options.flatMap((rawOption) => {
      const option = object(rawOption);
      return option && typeof option.id === "string" && typeof option.name === "string"
        ? [{ id: option.id, name: option.name, durationMinutes: typeof option.duration_minutes === "number" ? option.duration_minutes : null }]
        : [];
    }) : [];
    return [{ position, label: group.label, required: group.required !== false, options }];
  }) : [];
  const hours = Array.isArray(root.hours) ? root.hours.flatMap((rawHour) => {
    const hour = object(rawHour);
    return hour && typeof hour.weekday === "number" && typeof hour.start_time === "string" && typeof hour.end_time === "string"
      ? [{ weekday: hour.weekday, startTime: hour.start_time.slice(0, 5), endTime: displayEndTime(hour.end_time) }]
      : [];
  }) : [];
  const paletteData = object(settings.palette);
  const palette = getPalette(typeof paletteData?.id === "string" ? paletteData.id : "original");

  return {
    business: {
      id: business.id,
      name: business.name,
      slug: business.slug,
      whatsapp: typeof business.whatsapp === "string" ? business.whatsapp : null,
      logoUrl: typeof business.logo_url === "string" ? business.logo_url : null,
      address: typeof business.address === "string" ? business.address : null,
      googleMapsUrl: typeof business.google_maps_url === "string" ? business.google_maps_url : null,
      instagramUrl: typeof business.instagram_url === "string" ? business.instagram_url : null,
      facebookUrl: typeof business.facebook_url === "string" ? business.facebook_url : null,
    },
    groups,
    hours,
    settings: {
      durationMode: settings.duration_mode as PublicBookingData["settings"]["durationMode"],
      fixedDurationMinutes: typeof settings.fixed_duration_minutes === "number" ? settings.fixed_duration_minutes : 60,
      allowMultipleBlocks: settings.allow_multiple_blocks === true,
      palette,
      themePreference: settings.theme_preference === "dark" ? "dark" : "light",
    },
  };
}

export async function getPublicBookingPage(slug: string): Promise<PublicBookingData | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_booking_page", { p_slug: slug });
  if (error) throw new Error(`Não foi possível carregar a página pública: ${error.message}`);
  return parsePublicBookingPage(data);
}
