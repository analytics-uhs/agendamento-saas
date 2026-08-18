"use client";

import { ImageUp } from "lucide-react";
import { useRef, useState } from "react";
import { uploadBusinessLogo } from "@/lib/logo-upload";
import { Logo } from "@/components/ui/logo";
import type { ActionResult } from "@/types/business";

export function LogoUploader({ businessId, businessName, logoUrl, onUploaded }: {
  businessId: string; businessName: string; logoUrl: string | null;
  onUploaded: (url: string, result: ActionResult) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  return <div className="flex items-center gap-4">
    {logoUrl
      ? <span role="img" aria-label={`Logo de ${businessName}`} className="h-16 w-16 shrink-0 rounded-2xl border bg-cover bg-center" style={{ backgroundImage: `url("${logoUrl}")` }} />
      : <Logo name={businessName || "Negócio"} size="lg" />}
    <div><p className="text-sm font-medium">Logo</p><p className="mb-2 text-xs text-muted">PNG, JPEG ou WebP, até 2 MB.</p>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setUploading(true);
        const result = await uploadBusinessLogo(businessId, file);
        setUploading(false);
        if (result.ok && result.data) onUploaded(result.data.url, result);
        else onUploaded(logoUrl ?? "", result);
        event.target.value = "";
      }} />
      <button type="button" disabled={uploading} onClick={() => inputRef.current?.click()} className="focus-ring inline-flex h-9 items-center gap-2 rounded-xl border bg-card px-3 text-sm font-semibold hover:bg-surface disabled:opacity-50"><ImageUp className="h-4 w-4" />{uploading ? "Enviando..." : "Escolher imagem"}</button>
    </div>
  </div>;
}
