"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { acceptBusinessInvite, inspectBusinessInvite } from "@/lib/repositories/business-invites";
import { clearInvite, pendingInviteToken, rememberInvite } from "@/lib/auth/invite-session";
import { inviteError } from "@/lib/business-invites";
import type { ActionResult } from "@/types/business";
import { createClient } from "@/lib/supabase/server";

export async function beginInvite(token: string, destination: "signup" | "login" | "confirm") {
  const invite = await inspectBusinessInvite(token);
  if (invite.status !== "pending") { await clearInvite(); redirect("/convite"); }
  await rememberInvite(token);
  redirect(destination === "signup" ? "/criar-conta" : destination === "login" ? "/login" : "/convite");
}
export async function confirmInvite(_state: ActionResult): Promise<ActionResult> {
  void _state;
  const token = await pendingInviteToken();
  if (!token) return { ok: false, message: "Reabra o link do convite para continuar." };
  try { await acceptBusinessInvite(token); }
  catch (error) { return { ok: false, message: inviteError(error instanceof Error ? error.message : "") }; }
  await clearInvite();
  revalidatePath("/admin", "layout");
  redirect("/convite/pronto");
}
export async function leaveInvite() { await clearInvite(); redirect("/login"); }
export async function changeInviteAccount(token?: string) {
  if (token) {
    if ((await inspectBusinessInvite(token)).status !== "pending") redirect("/convite");
    await rememberInvite(token);
  }
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
