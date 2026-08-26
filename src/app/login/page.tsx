import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { resolveAuthenticatedDestination } from "@/lib/auth/destination";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [destination, { next }] = await Promise.all([resolveAuthenticatedDestination(), searchParams]);
  if (destination) redirect(destination);
  return <LoginForm next={next} />;
}
