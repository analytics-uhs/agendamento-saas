"use client";

import { Check, Copy } from "lucide-react";
import { useState, useTransition } from "react";
import { saveBusiness } from "@/app/admin/actions";
import { LogoUploader } from "@/components/admin/logo-uploader";
import { PageHeading } from "@/components/admin/page-heading";
import { SaveNotice } from "@/components/admin/save-notice";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { normalizeSlug } from "@/lib/business-form";
import { publicDomain } from "@/lib/public-url";
import type { ActionResult, BusinessForm } from "@/types/business";

export function BusinessPageContent({ initialBusiness }: { initialBusiness: BusinessForm }) {
  const [business, setBusiness] = useState(initialBusiness);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const link = `https://${publicDomain}/${business.slug}`;

  return <><PageHeading title="Meu negócio" description="Informações exibidas na página pública." /><div className="mt-6 space-y-6">
    <section className="space-y-5 rounded-xl border bg-background p-4 sm:p-5">
      <LogoUploader businessId={business.id!} businessName={business.name} logoUrl={business.logoUrl} onUploaded={(url, uploadResult) => { if (uploadResult.ok) setBusiness((current) => ({ ...current, logoUrl: url })); setResult(uploadResult); }} />
      <div className="space-y-2"><Label htmlFor="business-admin-name">Nome</Label><Input id="business-admin-name" value={business.name} onChange={(event) => setBusiness({ ...business, name: event.target.value })} /></div>
      <div className="space-y-2"><Label htmlFor="business-admin-whatsapp">WhatsApp</Label><Input id="business-admin-whatsapp" value={business.whatsapp} onChange={(event) => setBusiness({ ...business, whatsapp: event.target.value })} /></div>
      <div className="space-y-2"><Label htmlFor="business-admin-slug">Link público</Label><div className="flex items-center rounded-xl border bg-card px-3"><span className="text-sm text-muted">{publicDomain}/</span><input id="business-admin-slug" className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none" value={business.slug} onChange={(event) => setBusiness({ ...business, slug: normalizeSlug(event.target.value) })} /></div></div>
      <div className="flex flex-wrap items-center justify-between gap-3"><SaveNotice result={result} /><Button disabled={pending} onClick={() => startTransition(async () => setResult(await saveBusiness(business)))}>{pending ? "Salvando..." : "Salvar alterações"}</Button></div>
    </section>
    <section className="flex items-center justify-between gap-3 rounded-xl border bg-background p-4"><div className="min-w-0"><p className="text-xs text-muted">Sua página</p><p className="truncate text-sm font-medium">{publicDomain}/{business.slug}</p></div><Button variant="outline" size="sm" onClick={async () => { await navigator.clipboard?.writeText(link); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? "Copiado" : "Copiar link"}</Button></section>
  </div></>;
}
