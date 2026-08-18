import { createClient } from "@/lib/supabase/server";
import { weekdayLabels } from "@/lib/business-form";
import type { BusinessForm, BusinessGroupForm } from "@/types/business";

export async function getBusinessConfiguration(businessId: string): Promise<BusinessForm> {
  const supabase = await createClient();
  const [businessResult, groupsResult, optionsResult, hoursResult, settingsResult] = await Promise.all([
    supabase.from("businesses").select("id, name, slug, whatsapp, logo_url").eq("id", businessId).single(),
    supabase.from("booking_groups").select("id, position, label, active, required").eq("business_id", businessId).order("position"),
    supabase.from("booking_options").select("id, group_id, name, duration_minutes, sort_order").eq("business_id", businessId).order("sort_order"),
    supabase.from("business_hours").select("id, weekday, active, start_time, end_time").eq("business_id", businessId).order("weekday"),
    supabase.from("business_settings").select("duration_mode, fixed_duration_minutes, palette, theme_preference").eq("business_id", businessId).single(),
  ]);

  const error = businessResult.error ?? groupsResult.error ?? optionsResult.error ?? hoursResult.error ?? settingsResult.error;
  if (error) throw new Error(`Não foi possível carregar as configurações: ${error.message}`);
  if (!businessResult.data || !groupsResult.data || !optionsResult.data || !hoursResult.data || !settingsResult.data) {
    throw new Error("A configuração do estabelecimento está incompleta.");
  }
  if (groupsResult.data.length !== 2) throw new Error("Os Grupos 1 e 2 não estão configurados corretamente.");

  const groups = groupsResult.data.map((group): BusinessGroupForm => ({
    id: group.id,
    position: group.position as 1 | 2,
    label: group.label,
    active: group.active,
    required: group.required,
    options: optionsResult.data.filter((option) => option.group_id === group.id).map((option) => ({
      id: option.id,
      name: option.name,
      durationMinutes: option.duration_minutes,
    })),
  })) as [BusinessGroupForm, BusinessGroupForm];

  const palette = settingsResult.data.palette;
  const paletteId = palette && typeof palette === "object" && !Array.isArray(palette) && typeof palette.id === "string"
    ? palette.id
    : "original";

  return {
    id: businessResult.data.id,
    name: businessResult.data.name,
    slug: businessResult.data.slug,
    whatsapp: businessResult.data.whatsapp ?? "",
    logoUrl: businessResult.data.logo_url,
    groups,
    hours: hoursResult.data.map((hour) => ({
      id: hour.id,
      weekday: hour.weekday,
      label: weekdayLabels[hour.weekday],
      active: hour.active,
      startTime: hour.start_time.slice(0, 5),
      endTime: hour.end_time.slice(0, 5),
    })),
    durationMode: settingsResult.data.duration_mode,
    fixedDurationMinutes: settingsResult.data.fixed_duration_minutes,
    paletteId,
    themePreference: settingsResult.data.theme_preference,
  };
}
