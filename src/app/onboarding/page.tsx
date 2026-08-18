import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { getCurrentBusiness } from "@/lib/repositories/businesses";
export const metadata: Metadata = { title: "Configuração inicial" };
export default async function OnboardingPage() {
  const user = await requireAuthenticatedUser();
  if (await getCurrentBusiness(user.id)) redirect("/admin");
  return <OnboardingWizard />;
}
