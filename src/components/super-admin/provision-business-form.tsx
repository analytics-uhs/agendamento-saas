"use client";
import { useActionState } from "react";
import { provisionBusiness } from "@/app/super-admin/provisioning-actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import type { ActionResult } from "@/types/business";
export function ProvisionBusinessForm() {
  const [state, action, pending] = useActionState(provisionBusiness, { ok: false, message: "" } as ActionResult);
  return <form action={action} className="mt-6 max-w-xl space-y-4">
    <div className="space-y-2"><Label htmlFor="provision-name">Nome do negócio</Label><Input id="provision-name" name="name" required minLength={2} maxLength={120} /></div>
    <div className="space-y-2"><Label htmlFor="provision-slug">Link público</Label><Input id="provision-slug" name="slug" required minLength={3} maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="nome-do-negocio" /><p className="text-sm text-muted">Use letras minúsculas, números e hífens.</p></div>
    <div className="space-y-2"><Label htmlFor="provision-whatsapp">WhatsApp (opcional)</Label><Input id="provision-whatsapp" name="whatsapp" type="tel" maxLength={30} /></div>
    {state.message && <p role="alert" className="text-sm text-danger">{state.message}</p>}
    <Button type="submit" disabled={pending}>{pending ? "Criando…" : "Criar negócio"}</Button>
    <p className="text-sm text-muted">O proprietário será vinculado somente após aceitar o convite. Nenhuma conta ou senha será criada agora.</p>
  </form>;
}
