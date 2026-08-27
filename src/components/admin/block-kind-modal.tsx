"use client";

import { Ban, Boxes } from "lucide-react";
import { Modal } from "@/components/ui/modal";

export function BlockKindModal({ intentName, onSelect, onClose }: { intentName: string; onSelect: (kind: "primary" | "complementary") => void; onClose: () => void }) {
  return <Modal title="O que deseja bloquear?" onClose={onClose}><div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
    <button type="button" className="focus-ring min-h-28 rounded-xl border bg-background p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary/5" onClick={() => onSelect("primary")}><Ban className="h-5 w-5 text-primary"/><span className="mt-3 block text-sm font-semibold">Agenda principal</span><span className="mt-1 block text-xs text-muted">Impede agendamentos no período.</span></button>
    <button type="button" className="focus-ring min-h-28 rounded-xl border bg-background p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary/5" onClick={() => onSelect("complementary")}><Boxes className="h-5 w-5 text-primary"/><span className="mt-3 block text-sm font-semibold">{intentName}</span><span className="mt-1 block text-xs text-muted">Indisponibiliza um recurso complementar.</span></button>
  </div></Modal>;
}
