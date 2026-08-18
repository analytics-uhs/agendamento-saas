"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { Logo } from "@/components/ui/logo";
import { ThemeControl } from "@/components/theme/theme-control";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("arthur@studio.com"), [password, setPassword] = useState("123456");
  return <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-10"><div className="w-full max-w-sm">
    <div className="mb-8 flex flex-col items-center text-center"><Logo size="lg" /><h1 className="mt-4 text-2xl font-semibold tracking-tight">AgendaFácil</h1><p className="mt-1 text-sm text-muted">Agendamentos online para o seu negócio</p></div>
    <form className="space-y-4 rounded-2xl border bg-background p-6" onSubmit={(event) => { event.preventDefault(); router.push("/admin"); }}>
      <div className="space-y-2"><Label htmlFor="email">E-mail</Label><Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="password">Senha</Label><Input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></div>
      <Button type="submit" className="w-full">Entrar</Button>
      <Link href="/onboarding" className="focus-ring flex h-11 w-full items-center justify-center rounded-xl border bg-card text-sm font-semibold hover:bg-surface">Criar conta</Link>
    </form>
    <div className="mt-5"><ThemeControl /></div><p className="mt-5 text-center text-xs text-muted">MVP visual com dados fictícios.</p>
  </div></main>;
}
