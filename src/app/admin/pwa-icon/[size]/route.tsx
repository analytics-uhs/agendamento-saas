import { ImageResponse } from "next/og";
import { getAuthenticatedAdminPwaContext } from "@/lib/admin-pwa-server";
import { selectAdminPwaIconSource } from "@/lib/admin-pwa";
import { getSupabaseEnvironment } from "@/lib/supabase/env";

const allowedSizes = new Set([180, 192, 512]);
const allowedImageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

async function imageDataUrl(url: string) {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5_000) });
  const contentType = response.headers.get("content-type")?.split(";")[0].toLowerCase() ?? "";
  if (!response.ok || !allowedImageTypes.has(contentType)) throw new Error("Imagem inválida");
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 2 * 1024 * 1024) throw new Error("Imagem excede o limite");
  return `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;
}

async function resolveIconSource(request: Request, context: { logoUrl: string | null; businessId: string }) {
  const selected = selectAdminPwaIconSource({
    logoUrl: context.logoUrl,
    businessId: context.businessId,
    supabaseUrl: getSupabaseEnvironment().url,
    defaultIconUrl: new URL("/icon.png", request.url).href,
  });
  if (selected.source === "business") {
    try {
      return await imageDataUrl(selected.url);
    } catch {
      // A logo remota é opcional; o ícone padrão mantém a instalação funcional.
    }
  }
  return imageDataUrl(new URL("/icon.png", request.url).href);
}

export async function GET(request: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  if (!allowedSizes.has(size)) return new Response("Tamanho não suportado", { status: 404 });

  const context = await getAuthenticatedAdminPwaContext();
  if (!context) return new Response("Não autorizado", { status: 401 });
  const source = await resolveIconSource(request, context);
  const padding = Math.round(size * 0.12);

  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#FFFFFF", padding }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse renderiza o PNG do ícone, não uma imagem da UI. */}
      <img src={source} alt="" width={size - padding * 2} height={size - padding * 2} style={{ objectFit: "contain" }} />
    </div>,
    {
      width: size,
      height: size,
      headers: {
        "Cache-Control": "private, max-age=86400",
        "Content-Type": "image/png",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
