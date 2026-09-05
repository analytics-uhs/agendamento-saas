"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { prepareNfceForSale } from "@/app/admin/fiscal/actions";

export function FiscalPrepare({ saleId }: { saleId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  return <div className="space-y-3">
    <p className="text-sm text-muted">Prepare os itens desta venda para uma futura emissão. Nenhuma NFC-e será emitida agora.</p>
    <Button disabled={pending} onClick={() => {
      setError("");
      startTransition(async () => {
        try {
          const result = await prepareNfceForSale(saleId);
          if (!result.ok || !result.data) { setError(result.message); return; }
          router.push(`/admin/fiscal/${result.data.id}`);
          router.refresh();
        } catch { setError("Não foi possível preparar agora. Tente novamente."); }
      });
    }}>{pending ? "Preparando…" : "Preparar NFC-e"}</Button>
    {pending && <p role="status" className="text-sm text-muted">Preparando documento…</p>}
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
  </div>;
}
