"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Clock3, ExternalLink, Home, LogOut, Palette, Settings2, Store } from "lucide-react";
import { logout } from "@/app/auth/actions";
import { classes } from "@/lib/classes";
import { publicDomain } from "@/mocks/app";
import { useMockApp } from "@/components/mock-app-provider";
import type { CurrentBusiness } from "@/lib/repositories/businesses";
import { Logo } from "@/components/ui/logo";
import { ThemeControl } from "@/components/theme/theme-control";

const nav = [
  { href: "/admin", label: "Início", Icon: Home, exact: true },
  { href: "/admin/agenda", label: "Agenda", Icon: CalendarDays },
  { href: "/admin/configuracao", label: "Configuração", Icon: Settings2 },
  { href: "/admin/horarios", label: "Horários", Icon: Clock3 },
  { href: "/admin/aparencia", label: "Aparência", Icon: Palette },
  { href: "/admin/negocio", label: "Meu negócio", Icon: Store },
];

export function AdminShell({ children, currentBusiness }: { children: React.ReactNode; currentBusiness: CurrentBusiness | null }) {
  const pathname = usePathname();
  const { state } = useMockApp();
  const business = currentBusiness ?? state.business;
  const active = (href: string, exact?: boolean) => exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return <div className="min-h-screen bg-surface">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-background px-4 py-6 lg:flex">
      <Link href="/admin" className="focus-ring flex items-center gap-2 rounded-xl px-2"><Logo /><span className="font-semibold">AgendaFácil</span></Link>
      <nav className="mt-8 flex flex-col gap-1" aria-label="Principal">
        {nav.map(({ href, label, Icon, exact }) => <Link key={href} href={href} className={classes("focus-ring flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors", active(href, exact) ? "bg-primary/10 text-primary" : "text-muted hover:bg-surface hover:text-foreground")}><Icon className="h-4 w-4" />{label}</Link>)}
      </nav>
      <div className="mt-auto space-y-3">
        <ThemeControl />
        <Link href={`/agendar/${business.slug}`} className="focus-ring block rounded-xl border p-3">
          <span className="text-xs text-muted">Página pública</span>
          <span className="mt-1 flex items-center gap-1 text-sm font-medium text-primary"><span className="truncate">{publicDomain}/{business.slug}</span><ExternalLink className="h-3.5 w-3.5" /></span>
        </Link>
        <form action={logout}><button type="submit" className="focus-ring flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-muted hover:bg-surface hover:text-foreground"><LogOut className="h-4 w-4" />Sair</button></form>
      </div>
    </aside>
    <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-background px-4 py-3 lg:hidden">
      <Link href="/admin" className="flex min-w-0 items-center gap-2"><Logo size="sm" /><span className="truncate text-sm font-semibold">{business.name}</span></Link>
      <div className="flex items-center gap-1"><ThemeControl compact /><Link href={`/agendar/${business.slug}`} className="focus-ring rounded-lg border px-3 py-1.5 text-xs font-medium">Ver página</Link><form action={logout}><button type="submit" aria-label="Sair" className="focus-ring rounded-lg border p-2 text-muted"><LogOut className="h-4 w-4" /></button></form></div>
    </header>
    <main className="px-4 pb-28 pt-7 lg:ml-64 lg:px-10 lg:pb-12"><div className="mx-auto w-full max-w-5xl">{children}</div></main>
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-background lg:hidden" aria-label="Principal móvel"><div className="no-scrollbar flex overflow-x-auto">
      {nav.map(({ href, label, Icon, exact }) => <Link key={href} href={href} className={classes("focus-ring flex min-w-[74px] flex-1 flex-col items-center gap-1 px-2 py-2.5 text-[11px] font-medium", active(href, exact) ? "text-primary" : "text-muted")}><Icon className="h-5 w-5" /><span className="max-w-[82px] truncate">{label}</span></Link>)}
    </div></nav>
  </div>;
}
