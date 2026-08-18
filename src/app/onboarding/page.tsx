import type { Metadata } from "next";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
export const metadata: Metadata = { title: "Configuração inicial" };
export default function OnboardingPage() { return <OnboardingWizard />; }
