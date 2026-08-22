import type { MetadataRoute } from "next";
import type { Palette } from "@/types/scheduling";
import type { VisualThemePreference } from "@/types/business";

export const ADMIN_PWA_MANIFEST_URL = "/admin/manifest.webmanifest";
export const ADMIN_PWA_ICON_URL = "/admin/pwa-icon";

export type AdminPwaPlatform = {
  ios: boolean;
  standalone: boolean;
};

export type AdminPwaInstallMode = "hidden" | "native" | "ios_instructions";

export function selectAdminPwaIconSource(input: {
  logoUrl: string | null;
  businessId: string;
  supabaseUrl: string;
  defaultIconUrl: string;
}) {
  if (!input.logoUrl) return { url: input.defaultIconUrl, source: "fallback" as const };
  try {
    const logo = new URL(input.logoUrl);
    const supabase = new URL(input.supabaseUrl);
    const expectedPath = `/storage/v1/object/public/business-logos/${input.businessId}/logo`;
    if (logo.origin === supabase.origin && logo.pathname === expectedPath) {
      return { url: logo.href, source: "business" as const };
    }
  } catch {
    // Um endereço inválido nunca é buscado pelo servidor.
  }
  return { url: input.defaultIconUrl, source: "fallback" as const };
}

export function pwaShortName(name: string, maxLength = 24) {
  const normalized = name.trim().replace(/\s+/g, " ") || "AgendaFácil";
  const characters = Array.from(normalized);
  return characters.length <= maxLength
    ? normalized
    : `${characters.slice(0, Math.max(1, maxLength - 1)).join("").trimEnd()}…`;
}

export function detectAdminPwaPlatform(input: {
  userAgent: string;
  maxTouchPoints?: number;
  standaloneDisplayMode: boolean;
  navigatorStandalone?: boolean;
}): AdminPwaPlatform {
  const iosUserAgent = /iPad|iPhone|iPod/i.test(input.userAgent);
  const ipadDesktopMode = /Macintosh/i.test(input.userAgent) && (input.maxTouchPoints ?? 0) > 1;
  return {
    ios: iosUserAgent || ipadDesktopMode,
    standalone: input.standaloneDisplayMode || input.navigatorStandalone === true,
  };
}

export function adminPwaInstallMode(input: AdminPwaPlatform & { nativePromptAvailable: boolean }): AdminPwaInstallMode {
  if (input.standalone) return "hidden";
  if (input.ios) return "ios_instructions";
  return input.nativePromptAvailable ? "native" : "hidden";
}

export function iosPushRequiresInstalledPwa(platform: AdminPwaPlatform) {
  return platform.ios && !platform.standalone;
}

export function readAdminPwaPlatform(): AdminPwaPlatform {
  if (typeof window === "undefined" || typeof navigator === "undefined") return { ios: false, standalone: false };
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return detectAdminPwaPlatform({
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    standaloneDisplayMode: window.matchMedia("(display-mode: standalone)").matches,
    navigatorStandalone: navigatorWithStandalone.standalone,
  });
}

export function buildAdminPwaManifest(input: {
  businessName: string;
  businessSlug: string;
  palette: Palette;
  theme: VisualThemePreference;
  iconVersion: string;
}): MetadataRoute.Manifest {
  const backgroundColor = input.theme === "dark" ? "#181818" : input.palette.background;
  const version = encodeURIComponent(input.iconVersion);
  return {
    id: `/admin?pwa=${encodeURIComponent(input.businessSlug)}`,
    name: input.businessName.trim() || "AgendaFácil",
    short_name: pwaShortName(input.businessName),
    description: `Painel administrativo de ${input.businessName.trim() || "AgendaFácil"}.`,
    start_url: "/admin",
    scope: "/",
    display: "standalone",
    background_color: backgroundColor,
    theme_color: input.palette.primary,
    icons: [
      { src: `${ADMIN_PWA_ICON_URL}/192?v=${version}`, sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: `${ADMIN_PWA_ICON_URL}/512?v=${version}`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
