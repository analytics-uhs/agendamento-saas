"use client";

import { Check, Laptop, Moon, Sun } from "lucide-react";
import { useState, useTransition } from "react";
import { saveAppearance } from "@/app/admin/actions";
import { LogoUploader } from "@/components/admin/logo-uploader";
import { PageHeading } from "@/components/admin/page-heading";
import { SaveNotice } from "@/components/admin/save-notice";
import { BookingFlow } from "@/components/booking/booking-flow";
import { Button } from "@/components/ui/button";
import { palettes } from "@/lib/palettes";
import { classes } from "@/lib/classes";
import type { ActionResult, BusinessForm } from "@/types/business";
import type { ThemePreference } from "@/types/database";

const themes = [
  { id: "light" as const, label: "Claro", Icon: Sun },
  { id: "dark" as const, label: "Escuro", Icon: Moon },
  { id: "system" as const, label: "Sistema", Icon: Laptop },
];

export function AppearancePageContent({ initialBusiness }: { initialBusiness: BusinessForm }) {
  const [business, setBusiness] = useState(initialBusiness);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const setThemePreference = (themePreference: ThemePreference) => setBusiness((current) => ({ ...current, themePreference }));

  return <><PageHeading title="Aparência" description="Personalize as cores e visualize a página pública." />
    <section className="mt-6 rounded-xl border bg-background p-4 sm:p-5"><LogoUploader businessId={business.id!} businessName={business.name} logoUrl={business.logoUrl} onUploaded={(url, uploadResult) => { if (uploadResult.ok) setBusiness((current) => ({ ...current, logoUrl: url })); setResult(uploadResult); }} /></section>
    <section className="mt-6"><h2 className="text-sm font-semibold">Paletas</h2><div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">{palettes.map((palette) => { const selected = business.paletteId === palette.id; return <button key={palette.id} type="button" onClick={() => setBusiness({ ...business, paletteId: palette.id })} className={classes("focus-ring rounded-xl border bg-background p-3 text-left", selected && "border-primary bg-primary/5")}><div className="rounded-lg border p-3" style={{ background: palette.surface, borderColor: palette.border }}><div className="flex items-center gap-2"><span className="h-7 w-7 rounded-lg" style={{ background: palette.primary }} /><span className="h-2 w-16 rounded-full" style={{ background: palette.text }} /></div><span className="mt-3 block h-6 rounded-md" style={{ background: palette.background, border: `1px solid ${palette.border}` }} /><span className="mt-2 block h-6 rounded-md" style={{ background: palette.primary }} /><span className="mt-3 block h-2 w-10 rounded-full" style={{ background: palette.accent }} /></div><div className="mt-3 flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{palette.name}</span>{selected ? <Check className="h-4 w-4 text-primary" /> : null}</div></button>; })}</div></section>
    <section className="mt-6"><h2 className="text-sm font-semibold">Preferência de tema</h2><div className="mt-3 grid grid-cols-3 gap-2">{themes.map(({ id, label, Icon }) => <button key={id} type="button" onClick={() => setThemePreference(id)} className={classes("focus-ring flex items-center justify-center gap-2 rounded-xl border bg-background p-3 text-sm font-medium", business.themePreference === id && "border-primary bg-primary/5 text-primary")}><Icon className="h-4 w-4" />{label}</button>)}</div></section>
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3"><SaveNotice result={result} /><Button disabled={pending} onClick={() => startTransition(async () => setResult(await saveAppearance({ paletteId: business.paletteId, themePreference: business.themePreference })))}>{pending ? "Salvando..." : "Salvar aparência"}</Button></div>
    <section className="mt-8"><h2 className="text-sm font-semibold">Preview da página pública</h2><div className="mt-3 max-h-[600px] overflow-y-auto rounded-2xl border"><BookingFlow preview paletteId={business.paletteId} /></div></section>
  </>;
}
