"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, CalendarDays, Clock3, ExternalLink, Home, LogOut, Palette, Settings2, ShieldCheck, Store } from "lucide-react";
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

const nav = [
  { href: "/admin", label: "Início", Icon: Home, exact: true },
  { href: "/admin/agenda", label: "Agenda", Icon: CalendarDays },
  { href: "/admin/configuracao", label: "Configuração", Icon: Settings2 },
  { href: "/admin/horarios", label: "Horários", Icon: Clock3 },
  { href: "/admin/aparencia", label: "Aparência", Icon: Palette },
  { href: "/admin/negocio", label: "Meu negócio", Icon: Store },
];

export function AdminShell({ children, currentBusiness, platformAdmin, logoUrl, palette, initialTheme, notificationFeed, vapidPublicKey, user }: { children: React.ReactNode; currentBusiness: CurrentBusiness; platformAdmin: boolean; logoUrl: string | null; palette: BusinessPalette; initialTheme: VisualThemePreference; notificationFeed: AdminNotificationFeed; vapidPublicKey: string | null; user: { id: string; name: string; email: string } }) {
  const pathname = usePathname();
  const business = currentBusiness;
  const notificationCenter = useAdminNotificationCenter({ initialFeed: notificationFeed, userId: user.id, vapidPublicKey });
  const pwaInstall = useAdminPwaInstall();
  const navigation = platformAdmin ? [...nav, { href: "/super-admin", label: "Super Admin", Icon: ShieldCheck, exact: false }] : nav;
  const active = (href: string, exact?: boolean) => exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return <BusinessAppearance palette={palette} initialTheme={initialTheme}><div className="admin-pwa-shell min-h-screen bg-surface">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-background px-4 py-6 lg:flex">
      <div className="flex items-center justify-between gap-2"><Link href="/admin" className="focus-ring flex min-w-0 items-center gap-2 rounded-xl px-2"><BusinessLogo name={business.name} logoUrl={logoUrl} /><span className="truncate font-semibold">{business.name}</span></Link><AdminNotificationBell center={notificationCenter} placement="desktop" /></div>
      <nav className="mt-8 flex flex-col gap-1" aria-label="Principal">
        {navigation.map(({ href, label, Icon, exact }) => <Link key={href} href={href} className={classes("focus-ring flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors", active(href, exact) ? "bg-primary/10 text-primary" : "text-muted hover:bg-surface hover:text-foreground")}><Icon className="h-4 w-4" />{label}</Link>)}
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
      <div className="flex items-center gap-1"><AdminNotificationBell center={notificationCenter} placement="mobile" /><ThemeControl compact />{business.active ? <Link href={`/agendar/${business.slug}`} target="_blank" rel="noopener noreferrer" className="focus-ring rounded-lg border px-2.5 py-1.5 text-xs font-medium">Ver página</Link> : <span className="rounded-lg border border-accent/35 bg-accent/10 px-2 py-1.5 text-xs font-medium">Inativo</span>}<form action={logout}><button type="submit" aria-label="Sair" className="focus-ring rounded-lg border p-2 text-muted"><LogOut className="h-4 w-4" /></button></form></div>
    </header>
    <main className="px-4 pb-28 pt-7 lg:ml-64 lg:px-10 lg:pb-12"><div className="mx-auto w-full max-w-5xl">{!business.active ? <div role="status" className="mb-6 flex items-start gap-3 rounded-xl border border-accent/35 bg-accent/10 p-4"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-accent" /><div><p className="text-sm font-semibold">Estabelecimento inativo</p><p className="mt-0.5 text-sm text-muted">Você pode consultar e configurar o painel, mas a página pública e novos agendamentos estão indisponíveis.</p></div></div> : null}{children}</div></main>
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-background lg:hidden" aria-label="Principal móvel"><div className="no-scrollbar flex overflow-x-auto">
      {navigation.map(({ href, label, Icon, exact }) => <Link key={href} href={href} className={classes("focus-ring flex min-w-[74px] flex-1 flex-col items-center gap-1 px-2 py-2.5 text-[11px] font-medium", active(href, exact) ? "text-primary" : "text-muted")}><Icon className="h-5 w-5" /><span className="max-w-[82px] truncate">{label}</span></Link>)}
      <AdminPwaInstallAction controller={pwaInstall} placement="mobile" />
    </div></nav>
    <AdminPwaInstallDialog controller={pwaInstall} />
  </div></BusinessAppearance>;
}
