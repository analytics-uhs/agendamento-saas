import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignupForm } from "@/components/auth/signup-form";
import { resolveAuthenticatedDestination } from "@/lib/auth/destination";

export const metadata: Metadata = {
  title: "Criar conta",
  description: "Crie sua conta AgendaFácil e comece seus 15 dias grátis sem cartão.",
};

export default async function SignupPage() {
  const destination = await resolveAuthenticatedDestination();
  if (destination) redirect(destination);
  return <SignupForm />;
}
