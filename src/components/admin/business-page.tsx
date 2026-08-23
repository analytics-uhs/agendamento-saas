"use client";

import { Check, Copy, ExternalLink } from "lucide-react";
import { useState, useTransition } from "react";
import { saveBusiness } from "@/app/admin/actions";
import { LogoUploader } from "@/components/admin/logo-uploader";
import { PageHeader } from "@/components/ui/page-header";
import { SaveNotice } from "@/components/admin/save-notice";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

  return <><PageHeader title="Meu negócio" description="Informações exibidas na página pública." /><div className="mt-6 space-y-6">
    <Card as="section" padding="md" className="space-y-5">
      <LogoUploader businessId={business.id!} businessName={business.name} logoUrl={business.logoUrl} onUploaded={(url, uploadResult) => { if (uploadResult.ok) setBusiness((current) => ({ ...current, logoUrl: url })); setResult(uploadResult); }} />
      <div className="space-y-2"><Label htmlFor="business-admin-name">Nome</Label><Input id="business-admin-name" value={business.name} onChange={(event) => setBusiness({ ...business, name: event.target.value })} /></div>
      <div className="space-y-2"><Label htmlFor="business-admin-whatsapp">WhatsApp</Label><Input id="business-admin-whatsapp" value={business.whatsapp} onChange={(event) => setBusiness({ ...business, whatsapp: event.target.value })} /></div>
      <div className="space-y-2"><Label htmlFor="business-admin-address">Endereço físico</Label><Input id="business-admin-address" value={business.address} onChange={(event) => setBusiness({ ...business, address: event.target.value })} placeholder="Rua, número, bairro e cidade" /></div>
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="business-admin-maps">Google Maps</Label><Input id="business-admin-maps" inputMode="url" value={business.googleMapsUrl} onChange={(event) => setBusiness({ ...business, googleMapsUrl: event.target.value })} placeholder="maps.google.com/..." /></div><div className="space-y-2"><Label htmlFor="business-admin-instagram">Instagram</Label><Input id="business-admin-instagram" inputMode="url" value={business.instagramUrl} onChange={(event) => setBusiness({ ...business, instagramUrl: event.target.value })} placeholder="instagram.com/..." /></div><div className="space-y-2"><Label htmlFor="business-admin-facebook">Facebook</Label><Input id="business-admin-facebook" inputMode="url" value={business.facebookUrl} onChange={(event) => setBusiness({ ...business, facebookUrl: event.target.value })} placeholder="facebook.com/..." /></div></div>
      <div className="space-y-2"><Label htmlFor="business-admin-slug">Link público</Label><div className="flex items-center rounded-xl border bg-card px-3"><span className="text-sm text-muted">/</span><input id="business-admin-slug" className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none" value={business.slug} onChange={(event) => setBusiness({ ...business, slug: normalizeSlug(event.target.value) })} /></div></div>
      <div className="flex flex-wrap items-center justify-between gap-3"><SaveNotice result={result} /><Button disabled={pending} onClick={() => startTransition(async () => setResult(await saveBusiness(business)))}>{pending ? "Salvando..." : "Salvar alterações"}</Button></div>
    </Card>
    <Card as="section" padding="sm" className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><p className="text-xs text-muted">Sua página</p><a className="focus-ring inline-flex max-w-full items-center gap-1 truncate rounded text-sm font-medium hover:text-primary" href={link} target="_blank" rel="noopener noreferrer">/{business.slug}<ExternalLink className="h-3.5 w-3.5 shrink-0" /></a></div><Button variant="outline" size="sm" onClick={async () => { await navigator.clipboard?.writeText(link); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? "Copiado" : "Copiar link"}</Button></Card>
  </div></>;
}
