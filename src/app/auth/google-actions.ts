"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { rememberInvite } from "@/lib/auth/invite-session";
import { inspectBusinessInvite } from "@/lib/repositories/business-invites";

export async function loginWithGoogle(inviteToken: string | null, _state: { message: string | null }): Promise<{ message: string | null }> {
  void _state;
  if (inviteToken) {
    const invite = await inspectBusinessInvite(inviteToken);
    if (invite.status !== "pending") return { message: "Este convite não está disponível. Abra novamente o link recebido." };
    await rememberInvite(inviteToken);
  }
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  if (!origin) return { message: "Não foi possível iniciar o login. Recarregue a página." };
  // Server Actions validate the request origin; never accept a callback from form data.
  const callback = new URL("/auth/callback", origin);
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callback.toString() },
  });
  if (error || !data.url) return { message: "Não foi possível conectar ao Google. Tente novamente." };
  redirect(data.url);
}
