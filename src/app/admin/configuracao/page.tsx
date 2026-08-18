import type { Metadata } from "next";
import { ScheduleConfiguration } from "@/components/admin/schedule-configuration";
export const metadata: Metadata = { title: "Configuração da agenda" };
export default function ConfigurationPage() { return <ScheduleConfiguration />; }
