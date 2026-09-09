"use client";
import { useActionState } from "react";
import { confirmInvite } from "@/app/convite/actions";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/types/business";
export function InviteConfirmation() {
  const [state, action, pending] = useActionState(confirmInvite, { ok: false, message: "" } as ActionResult);
  return <form action={action} className="space-y-4">{state.message && <p role="alert" className="text-sm text-danger">{state.message}</p>}<Button type="submit" disabled={pending} className="w-full">{pending ? "Confirmando…" : "Confirmar acesso"}</Button></form>;
}
