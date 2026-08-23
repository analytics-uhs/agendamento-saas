import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  adminPwaInstallMode,
  buildAdminPwaManifest,
  detectAdminPwaPlatform,
  iosPushRequiresInstalledPwa,
  pwaShortName,
  selectAdminPwaIconSource,
} from "./admin-pwa";
import { getPalette } from "./palettes";

test("manifest do Admin reflete o negócio e abre em modo standalone", () => {
  const manifest = buildAdminPwaManifest({
    businessName: "Arena Central de Beach Tennis",
    businessSlug: "arena-central",
    palette: getPalette("oceano"),
    theme: "light",
    iconVersion: "2026-08-22T12:00:00.000Z",
  });
  assert.equal(manifest.name, "Arena Central de Beach Tennis");
  assert.equal(manifest.short_name, "Arena Central de Beach…");
  assert.equal(manifest.id, "/admin?pwa=arena-central");
  assert.equal(manifest.start_url, "/admin");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.theme_color, "#2A7DE1");
  assert.deepEqual(manifest.icons?.map((icon) => icon.sizes), ["192x192", "512x512"]);
});

test("manifest usa superfície escura e short name seguro quando necessário", () => {
  const manifest = buildAdminPwaManifest({
    businessName: "  Clínica   Exemplo  ",
    businessSlug: "clinica-exemplo",
    palette: getPalette("original"),
    theme: "dark",
    iconVersion: "v1",
  });
  assert.equal(manifest.short_name, "Clínica Exemplo");
  assert.equal(manifest.background_color, "#181818");
  assert.equal(pwaShortName(""), "AgendaFácil");
});

test("ícone prefere a logo persistente autorizada do negócio", () => {
  const selected = selectAdminPwaIconSource({
    logoUrl: "https://project.supabase.co/storage/v1/object/public/business-logos/business-1/logo",
    businessId: "business-1",
    supabaseUrl: "https://project.supabase.co",
    defaultIconUrl: "https://app.example/icon.png",
  });
  assert.deepEqual(selected, {
    url: "https://project.supabase.co/storage/v1/object/public/business-logos/business-1/logo",
    source: "business",
  });
});

test("ícone usa AgendaFácil quando não há logo ou a URL não pertence ao tenant", () => {
  const input = {
    businessId: "business-1",
    supabaseUrl: "https://project.supabase.co",
    defaultIconUrl: "https://app.example/icon.png",
  };
  assert.deepEqual(selectAdminPwaIconSource({ ...input, logoUrl: null }), {
    url: "https://app.example/icon.png",
    source: "fallback",
  });
  assert.deepEqual(selectAdminPwaIconSource({
    ...input,
    logoUrl: "https://project.supabase.co/storage/v1/object/public/business-logos/business-2/logo",
  }), {
    url: "https://app.example/icon.png",
    source: "fallback",
  });
  assert.deepEqual(selectAdminPwaIconSource({ ...input, logoUrl: "http://127.0.0.1/private" }), {
    url: "https://app.example/icon.png",
    source: "fallback",
  });
});

test("detecção contempla iPhone, iPad em modo desktop e standalone", () => {
  assert.deepEqual(detectAdminPwaPlatform({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
    standaloneDisplayMode: false,
  }), { ios: true, standalone: false });
  assert.deepEqual(detectAdminPwaPlatform({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)",
    maxTouchPoints: 5,
    standaloneDisplayMode: true,
  }), { ios: true, standalone: true });
});

test("instalação usa instruções no iOS, prompt nativo no Chromium e some em standalone", () => {
  assert.equal(adminPwaInstallMode({ ios: true, standalone: false, nativePromptAvailable: false }), "ios_instructions");
  assert.equal(adminPwaInstallMode({ ios: false, standalone: false, nativePromptAvailable: true }), "native");
  assert.equal(adminPwaInstallMode({ ios: false, standalone: false, nativePromptAvailable: false }), "hidden");
  assert.equal(adminPwaInstallMode({ ios: true, standalone: true, nativePromptAvailable: true }), "hidden");
});

test("Web Push no iOS exige que o painel esteja instalado", () => {
  assert.equal(iosPushRequiresInstalledPwa({ ios: true, standalone: false }), true);
  assert.equal(iosPushRequiresInstalledPwa({ ios: true, standalone: true }), false);
  assert.equal(iosPushRequiresInstalledPwa({ ios: false, standalone: false }), false);
});

test("PWA reutiliza o único Service Worker de push e não adiciona cache offline", () => {
  const publicFiles = readdirSync(join(process.cwd(), "public"));
  const workers = publicFiles.filter((name) => name.endsWith("-sw.js") || name === "service-worker.js" || name === "sw.js");
  assert.deepEqual(workers, ["push-sw.js"]);
  const worker = readFileSync(join(process.cwd(), "public/push-sw.js"), "utf8");
  assert.doesNotMatch(worker, /caches\.(open|match)|CacheStorage/);
  const installer = readFileSync(join(process.cwd(), "src/components/admin/admin-pwa-install.tsx"), "utf8");
  const notificationCenter = readFileSync(join(process.cwd(), "src/components/admin/admin-notification-center.tsx"), "utf8");
  assert.match(installer, /serviceWorker\.register\("\/push-sw\.js"/);
  assert.match(notificationCenter, /serviceWorker\.register\("\/push-sw\.js"/);
  assert.match(notificationCenter, /Notification\.requestPermission\(\)/);
});

test("rotas PWA resolvem o tenant pela sessão, sem aceitar business id externo", () => {
  const serverContext = readFileSync(join(process.cwd(), "src/lib/admin-pwa-server.ts"), "utf8");
  const manifestRoute = readFileSync(join(process.cwd(), "src/app/admin/manifest.webmanifest/route.ts"), "utf8");
  assert.match(serverContext, /auth\.getClaims\(\)/);
  assert.match(serverContext, /business_members/);
  assert.doesNotMatch(manifestRoute, /searchParams|businessId|business_id/);
});

test("manifest autenticado solicita credenciais e fica restrito ao layout Admin", () => {
  const adminLayout = readFileSync(join(process.cwd(), "src/app/admin/layout.tsx"), "utf8");
  const rootLayout = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");
  assert.match(adminLayout, /rel="manifest"/);
  assert.match(adminLayout, /crossOrigin="use-credentials"/);
  assert.doesNotMatch(rootLayout, /rel="manifest"|manifest:/);
});

test("ação de instalação preserva comportamento e classes compartilhadas da navegação", () => {
  const installer = readFileSync(join(process.cwd(), "src/components/admin/admin-pwa-install.tsx"), "utf8");
  const shell = readFileSync(join(process.cwd(), "src/components/admin/admin-shell.tsx"), "utf8");
  const mobileItem = readFileSync(join(process.cwd(), "src/components/admin/admin-mobile-navigation-item.tsx"), "utf8");
  assert.match(installer, /label="Instalar" Icon=\{Download\} onClick=\{controller\.install\}/);
  assert.doesNotMatch(installer, /Instalar aplicativo/);
  assert.match(installer, /adminSidebarItemClass/);
  assert.match(shell, /adminSidebarItemClass/);
  assert.match(shell, /AdminMobileNavigationItem/);
  assert.match(installer, /AdminMobileNavigationItem/);
  assert.match(mobileItem, /adminMobileNavItemClass/);
  assert.match(mobileItem, /<Icon className="h-5 w-5"/);
  assert.match(mobileItem, /<span className="max-w-\[82px\] truncate">\{label\}<\/span>/);
  assert.match(installer, /<Download className="h-4 w-4"/);
});
