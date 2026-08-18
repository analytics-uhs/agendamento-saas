import type { Metadata } from "next";
import { AgendaPageContent } from "@/components/admin/agenda-page";
export const metadata: Metadata = { title: "Agenda" };
export default function AgendaPage() { return <AgendaPageContent />; }
