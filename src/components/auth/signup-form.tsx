"use client";

import Image from "next/image";
import Link from "next/link";
import { Check, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { signup, type SignupState } from "@/app/criar-conta/actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";

const initialState: SignupState = {
  status: "idle",
  message: null,
  fieldErrors: {},
  values: { name: "", email: "" },
  emailAlreadyExists: false,
  attempt: 0,
};

function FieldError({ id, children }: { id: string; children?: string }) {
  if (!children) return null;
  return <p id={id} className="text-xs text-danger">{children}</p>;
}

function PasswordField({
  id,
  name,
  label,
  error,
}: {
  id: string;
  name: string;
  label: string;
  error?: string;
}) {
  const [visible, setVisible] = useState(false);
  const errorId = `${id}-error`;

  return <div className="space-y-2">
    <Label htmlFor={id}>{label}</Label>
    <div className="relative">
      <Input
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        autoComplete="new-password"
        minLength={8}
        required
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className={error ? "border-danger pr-12" : "pr-12"}
      />
      <button
        type="button"
        className="focus-ring absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-foreground"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? `Ocultar ${label.toLowerCase()}` : `Mostrar ${label.toLowerCase()}`}
        aria-pressed={visible}
      >
        {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
      </button>
    </div>
    <FieldError id={errorId}>{error}</FieldError>
  </div>;
}

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signup, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.attempt === 0) return;
    const password = formRef.current?.elements.namedItem("password");
    const confirmation = formRef.current?.elements.namedItem("confirmPassword");
    if (password instanceof HTMLInputElement) password.value = "";
    if (confirmation instanceof HTMLInputElement) confirmation.value = "";
  }, [state.attempt]);

  if (state.status === "confirmation_required") {
    return <main className="min-h-screen bg-surface px-4 py-8 sm:px-6 lg:flex lg:items-center lg:py-12">
      <section className="mx-auto w-full max-w-lg rounded-2xl border bg-background p-6 text-center sm:p-9">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-success/10 text-success"><Check className="h-6 w-6" aria-hidden="true" /></span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">Confira seu e-mail</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted">Enviamos a confirmação para <strong className="font-semibold text-foreground">{state.values.email}</strong>. Depois de confirmar, você seguirá para configurar sua agenda.</p>
        <Link href="/login" className="focus-ring mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-primary/90">Ir para entrar</Link>
      </section>
    </main>;
  }

  const nameErrorId = "signup-name-error";
  const emailErrorId = "signup-email-error";

  return <main className="min-h-screen bg-surface px-4 py-4 sm:px-6 sm:py-8 lg:flex lg:items-center lg:py-12">
    <div className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-2xl border bg-background lg:grid-cols-[0.9fr_1.1fr]">
      <section className="relative hidden overflow-hidden bg-[#29211f] p-10 text-white lg:flex lg:flex-col lg:justify-between" aria-label="Benefícios do AgendaFácil">
        <div className="absolute -right-16 -top-14 h-56 w-56 rounded-full bg-primary/25 blur-3xl" aria-hidden="true" />
        <div className="absolute -bottom-20 -left-16 h-64 w-64 rounded-full bg-accent/15 blur-3xl" aria-hidden="true" />
        <div className="relative">
          <Link href="/" className="focus-ring inline-flex rounded-xl" aria-label="AgendaFácil — início">
            <Image src="/brand/agendafacil-logo-claro.png" alt="AgendaFácil" width={500} height={500} className="h-11 w-11 object-contain" priority />
          </Link>
          <h2 className="mt-16 max-w-sm text-4xl font-semibold leading-[1.08] tracking-[-0.035em]">Sua agenda começa a trabalhar por você.</h2>
          <p className="mt-5 max-w-sm text-base leading-7 text-white/72">Configure uma vez e deixe seus clientes encontrarem horários e agendarem sozinhos, 24 horas por dia.</p>
        </div>
        <ul className="relative mt-12 space-y-4 text-sm text-white/88">
          <li className="flex items-center gap-3"><Check className="h-4 w-4 text-accent" aria-hidden="true" />15 dias grátis, sem cartão</li>
          <li className="flex items-center gap-3"><Check className="h-4 w-4 text-accent" aria-hidden="true" />Configuração guiada e rápida</li>
          <li className="flex items-center gap-3"><Check className="h-4 w-4 text-accent" aria-hidden="true" />Seus clientes não precisam criar conta</li>
        </ul>
      </section>

      <section className="px-5 py-6 sm:px-10 sm:py-9 lg:px-14 lg:py-12">
        <div className="flex items-center justify-between lg:hidden">
          <Link href="/" className="focus-ring inline-flex items-center gap-2 rounded-xl" aria-label="AgendaFácil — início">
            <Image src="/brand/agendafacil-logo-escuro.png" alt="AgendaFácil" width={500} height={500} className="h-9 w-9 object-contain dark:hidden" priority />
            <Image src="/brand/agendafacil-logo-claro.png" alt="" width={500} height={500} className="hidden h-9 w-9 object-contain dark:block" aria-hidden="true" />
            <span className="text-sm font-semibold">AgendaFácil</span>
          </Link>
          <Link href="/login" className="focus-ring rounded-lg text-sm font-semibold text-primary hover:underline">Entrar</Link>
        </div>

        <div className="mt-7 lg:mt-0">
          <h1 className="text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">Crie sua conta e comece grátis</h1>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted">Configure sua agenda e deixe seus clientes agendarem online, 24 horas por dia.</p>
        </div>

        <form ref={formRef} action={formAction} className="mt-6 space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="signup-name">Nome</Label>
            <Input id="signup-name" name="name" autoComplete="name" required defaultValue={state.values.name} aria-invalid={Boolean(state.fieldErrors.name)} aria-describedby={state.fieldErrors.name ? nameErrorId : undefined} className={state.fieldErrors.name ? "border-danger" : undefined} />
            <FieldError id={nameErrorId}>{state.fieldErrors.name}</FieldError>
          </div>
          <div className="space-y-2">
            <Label htmlFor="signup-email">E-mail</Label>
            <Input id="signup-email" name="email" type="email" inputMode="email" autoComplete="email" required defaultValue={state.values.email} aria-invalid={Boolean(state.fieldErrors.email)} aria-describedby={state.fieldErrors.email ? emailErrorId : undefined} className={state.fieldErrors.email ? "border-danger" : undefined} />
            <FieldError id={emailErrorId}>{state.fieldErrors.email}</FieldError>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <PasswordField id="signup-password" name="password" label="Senha" error={state.fieldErrors.password} />
            <PasswordField id="signup-confirm-password" name="confirmPassword" label="Confirmar senha" error={state.fieldErrors.confirmPassword} />
          </div>

          {state.message && <div role="alert" className={`rounded-xl px-3 py-2.5 text-sm ${state.status === "error" ? "bg-danger/10 text-danger" : "bg-success/10 text-success"}`}>
            {state.message}{state.emailAlreadyExists && <> <Link href="/login" className="focus-ring rounded font-semibold underline underline-offset-2">Entrar</Link></>}
          </div>}

          <Button type="submit" className="w-full" disabled={pending} aria-disabled={pending}>
            {pending ? "Criando sua conta..." : "Criar minha conta grátis"}
          </Button>
          <p className="text-center text-xs text-muted">15 dias grátis · Sem cartão</p>
        </form>

        <div className="mt-5 flex items-center justify-center gap-2 text-xs text-muted"><ShieldCheck className="h-4 w-4" aria-hidden="true" />Sua senha é protegida e nunca é armazenada pelo AgendaFácil.</div>
        <p className="mt-5 text-center text-sm text-muted">Já tem uma conta? <Link href="/login" className="focus-ring rounded font-semibold text-primary hover:underline">Entrar</Link></p>
      </section>
    </div>
  </main>;
}
