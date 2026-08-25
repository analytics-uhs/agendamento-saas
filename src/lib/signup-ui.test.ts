import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../../", import.meta.url);

async function source(path: string) {
  return readFile(new URL(path, projectRoot), "utf8");
}

test("a página pública de cadastro redireciona usuários já autenticados", async () => {
  const page = await source("src/app/criar-conta/page.tsx");
  assert.match(page, /resolveAuthenticatedDestination\(\)/);
  assert.match(page, /if \(destination\) redirect\(destination\)/);
  assert.match(page, /<SignupForm \/>/);
});

test("o formulário expõe os campos, autocomplete e ações esperadas", async () => {
  const form = await source("src/components/auth/signup-form.tsx");
  assert.match(form, /name="name" autoComplete="name"/);
  assert.match(form, /name="email" type="email" inputMode="email" autoComplete="email"/);
  assert.match(form, /autoComplete="new-password"/);
  assert.match(form, /name="confirmPassword"/);
  assert.match(form, /Criar minha conta grátis/);
  assert.match(form, /15 dias grátis · Sem cartão/);
  assert.match(form, /Já tem uma conta\?/);
  assert.match(form, /href="\/login"/);
  assert.match(form, /aria-invalid/);
  assert.match(form, /Criando sua conta\.\.\./);
});

test("a action usa Supabase Auth, salva o nome em metadata e resolve o destino", async () => {
  const action = await source("src/app/criar-conta/actions.ts");
  assert.match(action, /supabase\.auth\.signUp/);
  assert.match(action, /data: \{ name: validation\.values\.name \}/);
  assert.match(action, /confirmation_required/);
  assert.match(action, /Confira seu e-mail para confirmar sua conta\./);
  assert.match(action, /redirect\(await resolveUserDestination\(data\.user\.id\)\)/);
  assert.doesNotMatch(action, /complete_business_onboarding|founder_offer_claims/);
});

test("login e CTAs comerciais separam aquisição de acesso existente", async () => {
  const [loginPage, loginForm, marketing, landing] = await Promise.all([
    source("src/app/login/page.tsx"),
    source("src/components/auth/login-form.tsx"),
    source("src/lib/marketing.ts"),
    source("src/components/marketing/marketing-landing.tsx"),
  ]);
  assert.match(loginPage, /resolveAuthenticatedDestination\(\)/);
  assert.match(loginForm, /href="\/criar-conta"/);
  assert.match(marketing, /MARKETING_TRIAL_HREF = "\/criar-conta"/);
  assert.match(landing, /href=\{MARKETING_TRIAL_HREF\}/);
  assert.doesNotMatch(marketing, /MARKETING_TRIAL_HREF = "\/login"/);
});

test("callback confirmado resolve onboarding, admin ou super-admin sem open redirect", async () => {
  const callback = await source("src/app/auth/callback/route.ts");
  const destination = await source("src/lib/auth/destination.ts");
  assert.match(callback, /resolveUserDestination\(data\.user\.id\)/);
  assert.doesNotMatch(callback, /searchParams\.get\("next"\)/);
  assert.match(destination, /return "\/super-admin"/);
  assert.match(destination, /\? "\/admin" : "\/onboarding"/);
});
