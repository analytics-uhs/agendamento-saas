"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState } from "react";
import { login, type LoginState } from "@/app/auth/actions";
import appIcon from "@/app/icon.png";
import { ThemeControl } from "@/components/theme/theme-control";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { WhatsappIcon } from "@/components/ui/social-icons";

const initialState: LoginState = { message: null };
const whatsappSupportUrl = `https://wa.me/5553991414018?text=${encodeURIComponent("Olá! Preciso de ajuda com o AgendaFácil.")}`;

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(login, initialState);

  return <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-8"><div className="w-full max-w-sm text-center">
    <div className="flex justify-center">
      <div className="rounded-2xl bg-white p-2.5 shadow-sm ring-1 ring-black/5">
        <Image src={appIcon} alt="UHS Analytics" priority className="h-auto w-20 object-contain sm:w-22 lg:w-24" />
      </div>
    </div>
    <h1 className="mt-3 text-2xl font-semibold tracking-tight">AgendaFácil</h1>
    <p className="mt-1 text-sm text-muted">Organize sua agenda, simplifique sua rotina.</p>
    <form action={formAction} className="mt-6 space-y-4 rounded-2xl border bg-background p-6 text-left">
      <input type="hidden" name="next" value={next ?? "/admin"} />
      <div className="space-y-2"><Label htmlFor="email">E-mail</Label><Input id="email" name="email" type="email" autoComplete="email" required /></div>
      <div className="space-y-2"><Label htmlFor="password">Senha</Label><Input id="password" name="password" type="password" autoComplete="current-password" required /></div>
      {state.message && <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{state.message}</p>}
      <Button type="submit" className="w-full" disabled={pending}>{pending ? "Entrando..." : "Entrar"}</Button>
    </form>
    <div className="mt-4 flex justify-center"><ThemeControl compact /></div>
    <p className="mt-4 text-sm text-muted">Ainda não tem uma conta? <Link href="/onboarding" className="focus-ring rounded font-semibold text-primary hover:underline">Criar conta</Link></p>
    <div className="mx-auto mt-5 max-w-xs border-t pt-4 text-xs text-muted">
      <p>Precisa de ajuda?</p>
      <a href={whatsappSupportUrl} target="_blank" rel="noopener noreferrer" className="focus-ring mt-1 inline-flex items-center gap-1.5 rounded font-medium text-foreground hover:text-primary">
        <WhatsappIcon className="h-4 w-4 text-[#159447] dark:text-[#25D366]" />
        Fale com a gente pelo WhatsApp <span className="whitespace-nowrap">(53) 99141-4018</span>
      </a>
    </div>
  </div></main>;
}
