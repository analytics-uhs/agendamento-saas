import { createClient } from "@/lib/supabase/client";
import { saveLogoUrl } from "@/app/admin/actions";
import type { ActionResult } from "@/types/business";

const acceptedTypes = ["image/png", "image/jpeg", "image/webp"];
const maxSize = 2 * 1024 * 1024;

export function validateLogoFile(file: File) {
  if (!acceptedTypes.includes(file.type)) return "Use uma imagem PNG, JPEG ou WebP.";
  if (file.size > maxSize) return "A imagem deve ter no máximo 2 MB.";
  return null;
}

export async function uploadBusinessLogo(businessId: string, file: File): Promise<ActionResult<{ url: string }>> {
  const validationError = validateLogoFile(file);
  if (validationError) return { ok: false, message: validationError };

  const supabase = createClient();
  const path = `${businessId}/logo`;
  const { error } = await supabase.storage.from("business-logos").upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: true,
  });
  if (error) return { ok: false, message: `Não foi possível enviar a imagem: ${error.message}` };

  const { data } = supabase.storage.from("business-logos").getPublicUrl(path);
  const url = `${data.publicUrl}?v=${Date.now()}`;
  const result = await saveLogoUrl(url);
  return result.ok ? { ok: true, message: "Logo atualizado.", data: { url } } : result;
}
