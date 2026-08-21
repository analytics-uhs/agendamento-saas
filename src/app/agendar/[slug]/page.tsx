import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { BookingFlow } from "@/components/booking/booking-flow";
import { publicBookingMetadata } from "@/lib/public-booking-metadata";
import { getPublicBookingPage } from "@/lib/repositories/public-booking";

const getBooking = cache(getPublicBookingPage);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return publicBookingMetadata(await getBooking(slug));
}

export default async function PublicBookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const booking = await getBooking(slug);
  if (!booking) notFound();
  return <main className="min-h-screen"><BookingFlow booking={booking} /></main>;
}
