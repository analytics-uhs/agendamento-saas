import type { Metadata } from "next";
import { BookingFlow } from "@/components/booking/booking-flow";
export const metadata: Metadata = { title: "Agendar", description: "Escolha serviço, data e horário." };
export default function PublicBookingPage() { return <main className="min-h-screen"><BookingFlow /></main>; }
