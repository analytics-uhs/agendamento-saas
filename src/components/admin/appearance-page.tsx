"use client";

import { Check, ImageUp } from "lucide-react";
import { useMockApp } from "@/components/mock-app-provider";
import { PageHeading } from "@/components/admin/page-heading";
import { BookingFlow } from "@/components/booking/booking-flow";
import { Button } from "@/components/ui/button";
import { palettes } from "@/mocks/app";
import { classes } from "@/lib/classes";

export function AppearancePageContent() {
  const { state, update } = useMockApp();
  return <><PageHeading title="Aparência" description="Personalize as cores e visualize a página pública." /><section className="mt-6 rounded-xl border bg-background p-4 sm:p-5"><div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold">Logo</h2><p className="text-xs text-muted">Upload visual nesta fase do protótipo.</p></div><Button variant="outline" size="sm"><ImageUp className="h-4 w-4" />Escolher imagem</Button></div></section>
    <section className="mt-6"><h2 className="text-sm font-semibold">Paletas</h2><div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">{palettes.map((palette) => { const selected = state.paletteId === palette.id; return <button key={palette.id} type="button" onClick={() => update({ paletteId: palette.id })} className={classes("focus-ring rounded-xl border bg-background p-3 text-left", selected && "border-primary bg-primary/5")}><div className="rounded-lg border p-3" style={{ background: palette.surface, borderColor: palette.border }}><div className="flex items-center gap-2"><span className="h-7 w-7 rounded-lg" style={{ background: palette.primary }} /><span className="h-2 w-16 rounded-full" style={{ background: palette.text }} /></div><span className="mt-3 block h-6 rounded-md" style={{ background: palette.background, border: `1px solid ${palette.border}` }} /><span className="mt-2 block h-6 rounded-md" style={{ background: palette.primary }} /><span className="mt-3 block h-2 w-10 rounded-full" style={{ background: palette.accent }} /></div><div className="mt-3 flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{palette.name}</span>{selected ? <Check className="h-4 w-4 text-primary" /> : null}</div></button>; })}</div></section>
    <section className="mt-8"><h2 className="text-sm font-semibold">Preview da página pública</h2><div className="mt-3 max-h-[600px] overflow-y-auto rounded-2xl border"><BookingFlow preview /></div></section>
  </>;
}
