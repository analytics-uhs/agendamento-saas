import { bookingGroupRole } from "@/lib/booking-groups";
import { createClient } from "@/lib/supabase/server";
import type { BookingGroupCatalog } from "@/types/booking-groups";
import type { Database } from "@/types/database";

type GroupRow = Database["public"]["Tables"]["booking_groups"]["Row"];
type OptionRow = Database["public"]["Tables"]["booking_options"]["Row"];

export function mapBookingGroupCatalog(
  groups: GroupRow[],
  options: OptionRow[],
): BookingGroupCatalog[] {
  return groups.flatMap((group) => {
    const role = bookingGroupRole(group.position);
    if (!role) return [];
    return [{
      id: group.id,
      position: group.position as BookingGroupCatalog["position"],
      role,
      label: group.label,
      intentName: group.intent_name,
      occupancyMode: group.occupancy_mode,
      active: group.active,
      required: group.required,
      sortOrder: group.sort_order,
      options: options
        .filter((option) => option.group_id === group.id)
        .sort((left, right) => left.sort_order - right.sort_order)
        .map((option) => ({
          id: option.id,
          name: option.name,
          durationMinutes: option.duration_minutes,
          active: option.active,
          sortOrder: option.sort_order,
        })),
    }];
  }).sort((left, right) => left.position - right.position);
}

export async function getBookingGroupCatalog(
  businessId: string,
): Promise<BookingGroupCatalog[]> {
  const supabase = await createClient();
  const [groupsResult, optionsResult] = await Promise.all([
    supabase
      .from("booking_groups")
      .select("id, business_id, position, label, intent_name, occupancy_mode, active, required, sort_order, created_at, updated_at")
      .eq("business_id", businessId)
      .order("position"),
    supabase
      .from("booking_options")
      .select("id, business_id, group_id, name, duration_minutes, active, sort_order, created_at, updated_at")
      .eq("business_id", businessId)
      .order("sort_order"),
  ]);
  const error = groupsResult.error ?? optionsResult.error;
  if (error) throw new Error(`Não foi possível carregar o catálogo de grupos: ${error.message}`);
  return mapBookingGroupCatalog(groupsResult.data ?? [], optionsResult.data ?? []);
}
