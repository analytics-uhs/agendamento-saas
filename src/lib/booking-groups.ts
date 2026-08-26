export const bookingGroupPositionByRole = {
  primary: 1,
  secondary: 2,
  complementary: 3,
} as const;

export type BookingGroupRole = keyof typeof bookingGroupPositionByRole;
export type BookingGroupPosition = (typeof bookingGroupPositionByRole)[BookingGroupRole];
export type LegacyBookingGroupPosition = Extract<BookingGroupPosition, 1 | 2>;

const bookingGroupRoleByPosition = {
  1: "primary",
  2: "secondary",
  3: "complementary",
} as const satisfies Record<BookingGroupPosition, BookingGroupRole>;

const bookingGroupProductNameByRole = {
  primary: "Grupo principal",
  secondary: "Grupo secundário",
  complementary: "Grupo complementar",
} as const satisfies Record<BookingGroupRole, string>;

export function bookingGroupPosition<Role extends BookingGroupRole>(
  role: Role,
): (typeof bookingGroupPositionByRole)[Role] {
  return bookingGroupPositionByRole[role];
}

export function bookingGroupRole(position: number): BookingGroupRole | null {
  return bookingGroupRoleByPosition[position as BookingGroupPosition] ?? null;
}

export function bookingGroupProductName(position: number): string {
  const role = bookingGroupRole(position);
  return role ? bookingGroupProductNameByRole[role] : "Grupo";
}
