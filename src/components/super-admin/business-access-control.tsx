"use client";
import { useState, useTransition } from "react";
import { generateOwnerInvite, revokeOwnerInvite } from "@/app/super-admin/provisioning-actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { BusinessAccess } from "@/lib/business-invites";
function date(value: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value)); }
export function BusinessAccessControl({ businessId, access }: { businessId: string; access: BusinessAccess }) {
  const [link, setLink] = useState(""), [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  return <Card as="section" padding="md" className="mt-5 space-y-4"><h2 className="font-semibold">Acesso do cliente</h2>
    <p>{access.status === "active" ? "Ativo" : access.status === "waiting" ? "Aguardando acesso" : "Preparação"}</p>
    {access.owner ? <div><p className="font-medium">Proprietário: {access.owner.name || access.owner.email || "Vinculado"}</p>{access.owner.email && <p className="break-all text-sm text-muted">{access.owner.email}</p>}<p className="text-sm text-muted">Vinculado em {date(access.owner.since)}</p></div> : <>
      {access.invite && <p className="text-sm text-muted">Criado em {date(access.invite.createdAt)} · Expira em {date(access.invite.expiresAt)}{access.invite.status === "expired" ? " · Expirado" : access.invite.status === "revoked" ? " · Cancelado" : ""}</p>}
      {link && <div className="space-y-2"><p className="text-sm">Copie este link agora. Ele só será exibido nesta sessão da página.</p><Button variant="outline" onClick={async () => {
        try { await navigator.clipboard.writeText(link); setMessage("Link copiado. Envie-o somente ao proprietário."); }
        catch { setMessage("Não foi possível copiar automaticamente. Selecione e copie o link abaixo."); }
      }}>Copiar link</Button><input aria-label="Link do convite gerado" readOnly value={link} className="focus-ring w-full rounded border bg-card p-3 text-sm" onFocus={event => event.target.select()} /></div>}
      {!link && access.status === "waiting" && <p className="text-sm text-muted">Existe um convite ativo. Para copiar outro link, gere um novo; o anterior deixará de funcionar.</p>}
      <div className="flex flex-wrap gap-3"><Button disabled={pending} onClick={() => {
        if (access.status === "waiting" && !window.confirm("Gerar um novo link invalida o convite anterior. Continuar?")) return;
        setLink("");
        start(async () => { try { const result = await generateOwnerInvite(businessId); setMessage(result.message); if (result.ok && result.data) setLink(new URL(result.data.path, window.location.origin).toString()); } catch { setMessage("Não foi possível gerar o convite. Tente novamente."); } });
      }}>{pending ? "Aguarde…" : access.invite ? "Gerar novo link" : "Gerar convite"}</Button>
      {access.status === "waiting" && <Button variant="outline" disabled={pending} onClick={() => {
        if (!window.confirm("Cancelar este convite? O link deixará de funcionar.")) return;
        start(async () => { try { const result = await revokeOwnerInvite(businessId); setMessage(result.message); if (result.ok) setLink(""); } catch { setMessage("Não foi possível cancelar. Tente novamente."); } });
      }}>Cancelar convite</Button>}</div>
    </>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </Card>;
}
