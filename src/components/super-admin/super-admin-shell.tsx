"use client";

import { Building2, LayoutDashboard, LogOut, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/auth/actions";
import { ThemeControl } from "@/components/theme/theme-control";
import { Logo } from "@/components/ui/logo";
import { classes } from "@/lib/classes";

const navigation = [
  { href: "/super-admin", label: "Visão geral", Icon: LayoutDashboard, exact: true },
  { href: "/super-admin/negocios", label: "Negócios", Icon: Building2, exact: false },
];

export function SuperAdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const active = (href: string, exact: boolean) => exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return <div className="min-h-screen bg-surface">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-background px-4 py-6 lg:flex">
      <Link href="/super-admin" className="focus-ring flex items-center gap-2 rounded-xl px-2"><Logo /><span className="font-semibold">AgendaFácil</span></Link>
      <div className="mx-2 mt-5 flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-sm font-semibold text-primary"><ShieldCheck className="h-4 w-4" />Super Admin</div>
      <nav className="mt-5 flex flex-col gap-1" aria-label="Super Admin">
        {navigation.map(({ href, label, Icon, exact }) => <Link key={href} href={href} className={classes("focus-ring flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors", active(href, exact) ? "bg-primary/10 text-primary" : "text-muted hover:bg-surface hover:text-foreground")}><Icon className="h-4 w-4" />{label}</Link>)}
      </nav>
      <div className="mt-auto space-y-3"><ThemeControl /><Link href="/admin" className="focus-ring block rounded-xl border px-3 py-2 text-center text-sm font-medium text-muted hover:bg-surface hover:text-foreground">Painel do negócio</Link><form action={logout}><button type="submit" className="focus-ring flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-muted hover:bg-surface hover:text-foreground"><LogOut className="h-4 w-4" />Sair</button></form></div>
    </aside>
    <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-background px-4 py-3 lg:hidden"><Link href="/super-admin" className="flex items-center gap-2"><Logo size="sm" /><span className="text-sm font-semibold">Super Admin</span></Link><div className="flex items-center gap-1"><ThemeControl compact /><form action={logout}><button type="submit" aria-label="Sair" className="focus-ring rounded-lg border p-2 text-muted"><LogOut className="h-4 w-4" /></button></form></div></header>
    <main className="px-4 pb-24 pt-7 lg:ml-64 lg:px-10 lg:pb-12"><div className="mx-auto w-full max-w-6xl">{children}</div></main>
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-background lg:hidden" aria-label="Super Admin móvel"><div className="grid grid-cols-2">{navigation.map(({ href, label, Icon, exact }) => <Link key={href} href={href} className={classes("focus-ring flex flex-col items-center gap-1 px-3 py-2.5 text-xs font-medium", active(href, exact) ? "text-primary" : "text-muted")}><Icon className="h-5 w-5" />{label}</Link>)}</div></nav>
  </div>;
}

