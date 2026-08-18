import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookingFlow } from "@/components/booking/booking-flow";
import { getPublicBookingPage } from "@/lib/repositories/public-booking";

export const metadata: Metadata = { title: "Agendar", description: "Escolha serviço, data e horário." };

export default async function PublicBookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const booking = await getPublicBookingPage(slug);
  if (!booking) notFound();
  return <main className="min-h-screen"><BookingFlow booking={booking} /></main>;
}
