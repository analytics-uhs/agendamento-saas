"use client";

import { useActionState } from "react";
import { loginWithGoogle } from "@/app/auth/google-actions";
import { Button } from "@/components/ui/button";

export function GoogleSignIn({ inviteToken }: { inviteToken?: string }) {
  const [state, action, pending] = useActionState(loginWithGoogle.bind(null, inviteToken ?? null), { message: null });
  return <form action={action} className="mt-4 space-y-2">
    <Button type="submit" variant="outline" className="w-full" disabled={pending}>{pending ? "Conectando ao Google..." : "Continuar com Google"}</Button>
    {state.message && <p role="alert" className="text-sm text-danger">{state.message}</p>}
  </form>;
}
