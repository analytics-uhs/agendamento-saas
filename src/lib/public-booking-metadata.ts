import type { Metadata } from "next";
import type { PublicBookingData } from "@/types/public-booking";

const description = "Escolha serviço, data e horário.";

export function publicBookingMetadata(
  booking: Pick<PublicBookingData, "business"> | null,
): Metadata {
  if (!booking) return { title: "Agendar", description };
  return {
    title: { absolute: `${booking.business.name} | AgendaFácil` },
    description,
    ...(booking.business.logoUrl
      ? { icons: { icon: [{ url: booking.business.logoUrl }] } }
      : {}),
  };
}
