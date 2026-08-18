import type { Metadata } from "next";
import { BusinessPageContent } from "@/components/admin/business-page";
export const metadata: Metadata = { title: "Meu negócio" };
export default function BusinessPage() { return <BusinessPageContent />; }
