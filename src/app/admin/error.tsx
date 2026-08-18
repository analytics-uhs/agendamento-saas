"use client";

import { Button } from "@/components/ui/button";

export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="rounded-xl border bg-background p-6 text-center">
    <h2 className="font-semibold">Não foi possível carregar esta tela</h2>
    <p className="mt-1 text-sm text-muted">Verifique sua conexão e tente novamente.</p>
    <Button className="mt-4" onClick={reset}>Tentar novamente</Button>
  </div>;
}
