"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, type LoginState } from "@/app/auth/actions";
import { ThemeControl } from "@/components/theme/theme-control";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { Logo } from "@/components/ui/logo";

const initialState: LoginState = { message: null };

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(login, initialState);

  return <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-10"><div className="w-full max-w-sm">
    <div className="mb-8 flex flex-col items-center text-center"><Logo size="lg" /><h1 className="mt-4 text-2xl font-semibold tracking-tight">AgendaFácil</h1><p className="mt-1 text-sm text-muted">Agendamentos online para o seu negócio</p></div>
    <form action={formAction} className="space-y-4 rounded-2xl border bg-background p-6">
      <input type="hidden" name="next" value={next ?? "/admin"} />
      <div className="space-y-2"><Label htmlFor="email">E-mail</Label><Input id="email" name="email" type="email" autoComplete="email" required /></div>
      <div className="space-y-2"><Label htmlFor="password">Senha</Label><Input id="password" name="password" type="password" autoComplete="current-password" required /></div>
      {state.message && <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{state.message}</p>}
      <Button type="submit" className="w-full" disabled={pending}>{pending ? "Entrando..." : "Entrar"}</Button>
      <Link href="/onboarding" className="focus-ring flex h-11 w-full items-center justify-center rounded-xl border bg-card text-sm font-semibold hover:bg-surface">Criar conta</Link>
    </form>
    <div className="mt-5"><ThemeControl /></div><p className="mt-5 text-center text-xs text-muted">Acesso administrativo protegido pelo Supabase Auth.</p>
  </div></main>;
}
