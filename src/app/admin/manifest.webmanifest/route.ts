import { buildAdminPwaManifest } from "@/lib/admin-pwa";
import { getAuthenticatedAdminPwaContext } from "@/lib/admin-pwa-server";

export async function GET() {
  const context = await getAuthenticatedAdminPwaContext();
  if (!context) return new Response("Não autorizado", { status: 401 });

  return Response.json(buildAdminPwaManifest({
    businessName: context.name,
    businessSlug: context.slug,
    palette: context.palette,
    theme: context.theme,
    iconVersion: context.iconVersion,
  }), {
    headers: {
      "Cache-Control": "private, no-cache",
      "Content-Type": "application/manifest+json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
