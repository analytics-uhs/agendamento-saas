import type { Metadata } from "next";
import { BusinessHours } from "@/components/admin/business-hours";
export const metadata: Metadata = { title: "Horários" };
export default function HoursPage() { return <BusinessHours />; }
