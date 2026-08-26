import type { BookingGroupPosition, BookingGroupRole } from "@/lib/booking-groups";
import type { BookingGroupOccupancyMode } from "@/types/database";

export type BookingGroupCatalogOption = {
  id: string;
  name: string;
  durationMinutes: number | null;
  active: boolean;
  sortOrder: number;
};

export type BookingGroupCatalog = {
  id: string;
  position: BookingGroupPosition;
  role: BookingGroupRole;
  label: string;
  intentName: string | null;
  occupancyMode: BookingGroupOccupancyMode | null;
  active: boolean;
  required: boolean;
  sortOrder: number;
  options: BookingGroupCatalogOption[];
};
