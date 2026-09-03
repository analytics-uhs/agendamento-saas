export type PublicBookingStartOrder = "service_first" | "date_first";

export const publicBookingStartOrders = [
  { value: "service_first", label: "Serviço primeiro", description: "Cliente escolhe o serviço/recurso antes da data." },
  { value: "date_first", label: "Data primeiro", description: "Cliente escolhe a data antes do serviço/recurso." },
] as const;

export function isPublicBookingStartOrder(value: unknown): value is PublicBookingStartOrder {
  return value === "service_first" || value === "date_first";
}

export function parsePublicBookingStartOrder(value: unknown): PublicBookingStartOrder {
  return isPublicBookingStartOrder(value) ? value : "service_first";
}
