import type { Metadata } from "next";
import { BookingConfirmationView } from "@/components/booking/booking-confirmation";

export const metadata: Metadata = { title: "Agendamento confirmado" };

export default async function ConfirmationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <BookingConfirmationView slug={slug} />;
}
