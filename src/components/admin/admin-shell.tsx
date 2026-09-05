"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, ExternalLink, LogOut } from "lucide-react";
import { logout } from "@/app/auth/actions";
import { classes } from "@/lib/classes";
import type { CurrentBusiness } from "@/lib/repositories/businesses";
import { BusinessAppearance } from "@/components/theme/business-appearance";
import { ThemeControl } from "@/components/theme/theme-control";
import { BusinessLogo } from "@/components/ui/business-logo";
import type { VisualThemePreference } from "@/types/business";
import type { Palette as BusinessPalette } from "@/types/scheduling";
import { AdminNotificationBell, useAdminNotificationCenter } from "@/components/admin/admin-notification-center";
import type { AdminNotificationFeed } from "@/types/admin-notifications";
import { AdminPwaInstallAction, AdminPwaInstallDialog, useAdminPwaInstall } from "@/components/admin/admin-pwa-install";
import { adminSidebarItemClass } from "@/lib/admin-navigation";
import { AdminMobileNavigationItem } from "@/components/admin/admin-mobile-navigation-item";

import { getAdminNavigation } from "@/lib/admin-navigation-items";
import type { BusinessModules } from "@/lib/business-modules";
import { ManagementAccess } from "@/components/admin/management-access";

export function AdminShell({ children, currentBusiness, modules, platformAdmin, logoUrl, palette, initialTheme, notificationFeed, vapidPublicKey, user }: { children: React.ReactNode; currentBusiness: CurrentBusiness; modules: BusinessModules; platformAdmin: boolean; logoUrl: string | null; palette: BusinessPalette; initialTheme: VisualThemePreference; notificationFeed: AdminNotificationFeed; vapidPublicKey: string | null; user: { id: string; name: string; email: string } }) {
  const pathname = usePathname();
  const business = currentBusiness;
  const notificationCenter = useAdminNotificationCenter({ initialFeed: notificationFeed, userId: user.id, vapidPublicKey });
  const pwaInstall = useAdminPwaInstall();
  const navigation = getAdminNavigation(modules, platformAdmin);
  const active = (href: string, exact?: boolean) => exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return <ManagementAccess.Provider value={modules.management}><BusinessAppearance palette={palette} initialTheme={initialTheme}><div className="admin-pwa-shell min-h-screen bg-surface">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-background px-4 py-6 lg:flex">
      <div className="flex items-center justify-between gap-2"><Link href="/admin" className="focus-ring flex min-w-0 items-center gap-2 rounded-xl px-2"><BusinessLogo name={business.name} logoUrl={logoUrl} /><span className="truncate font-semibold">{business.name}</span></Link><AdminNotificationBell center={notificationCenter} placement="desktop" /></div>
      <nav className="mt-8 flex flex-col gap-1" aria-label="Principal">
        {navigation.map(({ href, label, Icon, exact }) => <Link key={href} href={href} className={classes(adminSidebarItemClass, active(href, exact) ? "bg-primary/10 text-primary" : "text-muted hover:bg-surface hover:text-foreground")}><Icon className="h-4 w-4" />{label}</Link>)}
      </nav>
      <div className="mt-auto space-y-3">
        <AdminPwaInstallAction controller={pwaInstall} placement="desktop" />
        {business.active ? <Link href={`/agendar/${business.slug}`} target="_blank" rel="noopener noreferrer" className="focus-ring block rounded-xl border p-3">
          <span className="text-xs text-muted">Página pública</span>
          <span className="mt-1 flex items-center gap-1 text-sm font-medium text-primary"><span className="truncate">/{business.slug}</span><ExternalLink className="h-3.5 w-3.5" /></span>
        </Link> : <div className="rounded-xl border border-accent/35 bg-accent/10 p-3"><span className="text-xs font-medium text-foreground">Página pública indisponível</span><p className="mt-1 text-xs text-muted">Negócio inativo pela plataforma.</p></div>}
        <div className="border-t pt-3"><p className="truncate text-sm font-semibold">{user.name}</p><p className="truncate text-xs text-muted">{user.email}</p><div className="mt-2 flex items-center justify-between"><form action={logout}><button type="submit" className="focus-ring flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-muted hover:bg-surface hover:text-foreground"><LogOut className="h-4 w-4" />Sair</button></form><ThemeControl compact /></div></div>
      </div>
    </aside>
    <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-background px-4 py-3 lg:hidden">
      <Link href="/admin" aria-label={business.name} className="flex shrink-0 items-center"><BusinessLogo name={business.name} logoUrl={logoUrl} size="sm" /></Link>
      <div className="flex items-center gap-1">{business.active ? <Link href={`/agendar/${business.slug}`} target="_blank" rel="noopener noreferrer" aria-label="Abrir página pública" title="Abrir página pública" className="focus-ring rounded-lg border p-2 text-muted hover:bg-surface hover:text-foreground"><ExternalLink className="h-4 w-4" /></Link> : <span className="rounded-lg border border-accent/35 bg-accent/10 px-2 py-1.5 text-xs font-medium">Inativo</span>}<AdminNotificationBell center={notificationCenter} placement="mobile" /><ThemeControl compact /><form action={logout}><button type="submit" aria-label="Sair" className="focus-ring rounded-lg border p-2 text-muted"><LogOut className="h-4 w-4" /></button></form></div>
    </header>
    <main className="px-4 pb-28 pt-7 lg:ml-64 lg:px-10 lg:pb-12"><div className="mx-auto w-full max-w-5xl">{!business.active ? <div role="status" className="mb-6 flex items-start gap-3 rounded-xl border border-accent/35 bg-accent/10 p-4"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-accent" /><div><p className="text-sm font-semibold">Estabelecimento inativo</p><p className="mt-0.5 text-sm text-muted">Você pode consultar e configurar o painel, mas a página pública e novos agendamentos estão indisponíveis.</p></div></div> : null}{children}</div></main>
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-background lg:hidden" aria-label="Principal móvel"><div className="no-scrollbar flex overflow-x-auto">
      {navigation.map(({ href, label, Icon, exact }) => <AdminMobileNavigationItem key={href} href={href} label={label} Icon={Icon} active={active(href, exact)} />)}
      <AdminPwaInstallAction controller={pwaInstall} placement="mobile" />
    </div></nav>
    <AdminPwaInstallDialog controller={pwaInstall} />
  </div></BusinessAppearance></ManagementAccess.Provider>;
}
