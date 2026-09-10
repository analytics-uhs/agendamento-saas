import "server-only";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";

export const INVITE_COOKIE = "agendafacil-invite";
export function validInviteToken(token: unknown): token is string { return typeof token === "string" && /^[a-f0-9]{64}$/.test(token); }
export function newInviteToken() { return randomBytes(32).toString("hex"); }
export function hashInviteToken(token: string) {
  if (!validInviteToken(token)) throw Error("Convite inválido.");
  return createHash("sha256").update(token).digest("hex");
}
export async function pendingInviteToken() {
  const value = (await cookies()).get(INVITE_COOKIE)?.value;
  return validInviteToken(value) ? value : null;
}
export async function rememberInvite(token: string) {
  if (!validInviteToken(token)) throw Error("Convite inválido.");
  (await cookies()).set(INVITE_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 3600 });
}
export async function clearInvite() { (await cookies()).delete(INVITE_COOKIE); }
