"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changePlatformBusinessModule } from "@/app/super-admin/actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { BUSINESS_MODULES, type BusinessModules } from "@/lib/business-modules";
import type { ActionResult } from "@/types/business";

const descriptions = {
  scheduling: { label: "Agenda", description: "Agendamentos, clientes e disponibilidade." },
  management: { label: "Gestão", description: "Produtos, estoque, compras, PDV, vendas e financeiro." },
  fiscal: { label: "Fiscal", description: "Configuração fiscal e NFC-e." },
};

export function BusinessModulesControl({ businessId, modules }: { businessId: string; modules: BusinessModules }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<ActionResult | null>(null);
  return <Card as="section" padding="md" className="mt-5" aria-labelledby="business-modules-title">
    <h2 id="business-modules-title" className="font-semibold">Módulos</h2>
    <p className="mt-1 text-sm text-muted">Desativar um módulo restringe o acesso, sem apagar seus dados.</p>
    <div className="mt-4 divide-y">{BUSINESS_MODULES.map((module) => {
      const { label, description } = descriptions[module];
      const locked = module === "scheduling" && modules.scheduling;
      return <fieldset key={module} disabled={pending || locked} className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0 disabled:opacity-70">
        <legend className="sr-only">{label}</legend>
        <div className="min-w-0"><p className="text-sm font-medium">{label} <span className="ml-1 text-xs text-muted">{modules[module] ? "Ativo" : "Inativo"}</span></p>
          <p className="mt-1 text-sm text-muted">{description}</p>
          {module === "scheduling" ? <p className="mt-1 text-xs text-muted">A Agenda é necessária para a página Início e não pode ser desligada nesta versão.{!modules.scheduling ? " Ative para restaurar o acesso à navegação." : ""}</p> : null}
        </div>
        <Switch checked={modules[module]} label={`${modules[module] ? "Desativar" : "Ativar"} ${label}`} onChange={(enabled) => {
          setFeedback(null);
          startTransition(async () => {
            try { setFeedback(await changePlatformBusinessModule(businessId, module, enabled)); }
            catch { setFeedback({ ok: false, message: "Não foi possível atualizar o módulo. Tente novamente." }); }
            router.refresh();
          });
        }} />
      </fieldset>;
    })}</div>
    {pending ? <p role="status" className="mt-3 text-sm text-muted">Atualizando módulo...</p> : null}
    {feedback ? <Card className="fixed bottom-6 left-4 right-4 z-50 flex items-center justify-between gap-3 p-4 shadow-lg sm:left-auto sm:max-w-md">
      <p role={feedback.ok ? "status" : "alert"} className={`text-sm ${feedback.ok ? "text-success" : "text-danger"}`}>{feedback.message}</p>
      <Button variant="ghost" size="sm" onClick={() => setFeedback(null)}>Fechar</Button>
    </Card> : null}
  </Card>;
}
