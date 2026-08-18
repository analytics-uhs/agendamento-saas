import "server-only";

import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { isPlatformAdmin } from "@/lib/repositories/super-admin";

export async function requirePlatformAdmin() {
  const user = await requireAuthenticatedUser();
  if (!await isPlatformAdmin()) redirect("/admin");
  return user;
}

