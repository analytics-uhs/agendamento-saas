"use client";

import { Check, Copy, ImageUp } from "lucide-react";
import { useState } from "react";
import { useMockApp } from "@/components/mock-app-provider";
import { PageHeading } from "@/components/admin/page-heading";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { Logo } from "@/components/ui/logo";
import { publicDomain } from "@/mocks/app";

export function BusinessPageContent() {
  const { state, update } = useMockApp(), [copied, setCopied] = useState(false), business = state.business;
  const link = `https://${publicDomain}/${business.slug}`;
  return <><PageHeading title="Meu negócio" description="Informações exibidas na página pública." /><div className="mt-6 space-y-6"><section className="space-y-5 rounded-xl border bg-background p-4 sm:p-5"><div className="flex items-center gap-4"><Logo name={business.name} size="lg" /><div><Label>Logo</Label><Button variant="outline" size="sm" className="mt-2"><ImageUp className="h-4 w-4" />Escolher imagem</Button></div></div><div className="space-y-2"><Label htmlFor="business-admin-name">Nome</Label><Input id="business-admin-name" value={business.name} onChange={(event) => update({ business: { ...business, name: event.target.value } })} /></div><div className="space-y-2"><Label htmlFor="business-admin-whatsapp">WhatsApp</Label><Input id="business-admin-whatsapp" value={business.whatsapp} onChange={(event) => update({ business: { ...business, whatsapp: event.target.value } })} /></div><div className="space-y-2"><Label htmlFor="business-admin-slug">Link público</Label><div className="flex items-center rounded-xl border bg-card px-3"><span className="text-sm text-muted">{publicDomain}/</span><input id="business-admin-slug" className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none" value={business.slug} onChange={(event) => update({ business: { ...business, slug: event.target.value.toLowerCase().replace(/\s+/g, "-") } })} /></div></div></section><section className="flex items-center justify-between gap-3 rounded-xl border bg-background p-4"><div className="min-w-0"><p className="text-xs text-muted">Sua página</p><p className="truncate text-sm font-medium">{publicDomain}/{business.slug}</p></div><Button variant="outline" size="sm" onClick={async () => { await navigator.clipboard?.writeText(link); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? "Copiado" : "Copiar link"}</Button></section></div></>;
}
