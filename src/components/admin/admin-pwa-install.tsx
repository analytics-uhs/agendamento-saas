"use client";

import { Download, Share, Smartphone, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminPwaInstallMode, readAdminPwaPlatform } from "@/lib/admin-pwa";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function useAdminPwaInstall() {
  const [platform, setPlatform] = useState({ ios: false, standalone: false });
  const [nativePrompt, setNativePrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [instructionsOpen, setInstructionsOpen] = useState(false);

  useEffect(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const refreshPlatform = () => setPlatform(readAdminPwaPlatform());
    const handlePrompt = (event: Event) => {
      event.preventDefault();
      setNativePrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setNativePrompt(null);
      setInstructionsOpen(false);
      refreshPlatform();
    };

    refreshPlatform();
    displayMode.addEventListener("change", refreshPlatform);
    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("appinstalled", handleInstalled);

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/push-sw.js", { scope: "/" }).catch((error: unknown) => {
        if (process.env.NODE_ENV === "development") {
          console.info("[admin-pwa] service worker registration failed", error instanceof Error ? error.message : "Erro desconhecido");
        }
      });
    }

    return () => {
      displayMode.removeEventListener("change", refreshPlatform);
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const mode = useMemo(() => adminPwaInstallMode({
    ...platform,
    nativePromptAvailable: Boolean(nativePrompt),
  }), [nativePrompt, platform]);

  const install = useCallback(async () => {
    if (mode === "ios_instructions") {
      setInstructionsOpen(true);
      return;
    }
    if (mode !== "native" || !nativePrompt) return;
    await nativePrompt.prompt();
    await nativePrompt.userChoice;
    setNativePrompt(null);
  }, [mode, nativePrompt]);

  return { mode, install, instructionsOpen, setInstructionsOpen };
}

export type AdminPwaInstallController = ReturnType<typeof useAdminPwaInstall>;

export function AdminPwaInstallAction({ controller, placement }: {
  controller: AdminPwaInstallController;
  placement: "desktop" | "mobile";
}) {
  if (controller.mode === "hidden") return null;
  if (placement === "mobile") {
    return <button type="button" onClick={controller.install} className="focus-ring flex min-w-[74px] flex-1 flex-col items-center gap-1 px-2 py-2.5 text-[11px] font-medium text-muted"><Download className="h-5 w-5" /><span>Instalar</span></button>;
  }
  return <button type="button" onClick={controller.install} className="focus-ring flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-foreground"><Download className="h-4 w-4" />Instalar aplicativo</button>;
}

export function AdminPwaInstallDialog({ controller }: { controller: AdminPwaInstallController }) {
  const { instructionsOpen, setInstructionsOpen } = controller;
  useEffect(() => {
    if (!instructionsOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setInstructionsOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [instructionsOpen, setInstructionsOpen]);

  if (!instructionsOpen) return null;
  return <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-3 sm:items-center" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget) setInstructionsOpen(false);
  }}>
    <section role="dialog" aria-modal="true" aria-labelledby="pwa-install-title" className="w-full max-w-sm rounded-2xl border bg-background p-5 shadow-2xl">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Smartphone className="h-5 w-5" /></span><div><h2 id="pwa-install-title" className="font-semibold">Instalar no iPhone ou iPad</h2><p className="mt-0.5 text-xs text-muted">Use o Safari para adicionar o painel à Tela de Início.</p></div></div>
        <button type="button" onClick={() => setInstructionsOpen(false)} aria-label="Fechar instruções" className="focus-ring rounded-lg p-2 text-muted hover:bg-surface"><X className="h-4 w-4" /></button>
      </header>
      <ol className="mt-5 space-y-3 text-sm">
        <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">1</span><span>No Safari, toque em <strong className="inline-flex items-center gap-1">Compartilhar <Share className="h-3.5 w-3.5" /></strong>.</span></li>
        <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">2</span><span>Escolha <strong>Adicionar à Tela de Início</strong>.</span></li>
        <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">3</span><span>Confirme em <strong>Adicionar</strong> e abra o novo ícone.</span></li>
      </ol>
      <p className="mt-4 rounded-xl bg-surface px-3 py-2.5 text-xs leading-relaxed text-muted">No iPhone, notificações Web Push só podem ser ativadas depois que o app for instalado e aberto pela Tela de Início.</p>
      <button type="button" onClick={() => setInstructionsOpen(false)} className="focus-ring mt-4 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white">Entendi</button>
    </section>
  </div>;
}
