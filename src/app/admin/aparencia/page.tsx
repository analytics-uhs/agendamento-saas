import type { Metadata } from "next";
import { AppearancePageContent } from "@/components/admin/appearance-page";
export const metadata: Metadata = { title: "Aparência" };
export default function AppearancePage() { return <AppearancePageContent />; }
