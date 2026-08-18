# AgendaFácil — agendamento-saas

SaaS multiempresa de agendamentos. A interface Next.js foi adaptada do MVP visual Lovable `analytics-uhs/vibrant-slot-wiz`; a arquitetura atual usa Next.js 16, TypeScript, App Router, Tailwind CSS 4 e Supabase.

## Estado atual

Esta etapa entrega a fundação real de autenticação e dados:

- login, logout, sessão SSR e proteção de `/admin` com Supabase Auth;
- modelo multiempresa isolado por estabelecimento;
- migrations, constraints, índices e Row Level Security (RLS);
- resolução do primeiro negócio ativo do usuário autenticado;
- clients Supabase separados para browser, Server Components e proxy;
- tipos TypeScript e repositories iniciais;
- RPC anônima curada para a futura página pública;
- seed sem credenciais e testes pgTAP de autorização.

As telas administrativas e o fluxo visual de agendamento ainda usam majoritariamente `src/mocks`. O motor de disponibilidade e a criação pública de agendamentos não fazem parte desta etapa.

## Configuração local

Copie `.env.example` para `.env.local` e configure:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

`NEXT_PUBLIC_SUPABASE_ANON_KEY` também é aceito para projetos que ainda usam a chave legada. Nenhuma service-role key é necessária no frontend e secrets não devem ser versionados.

```bash
npm install
npm run dev
```

Para subir a stack local (Docker necessário), aplicar todas as migrations, carregar o seed e testar:

```bash
npm run supabase:start
npm run supabase:reset
npm run supabase:test
```

Em um projeto remoto vinculado, use `npx supabase link --project-ref <ref>` e revise com `npx supabase db push --dry-run` antes de `npx supabase db push`.

## Domínio

Os dois grupos são genéricos e configuráveis. “Quadra/Esporte” e “Profissional/Serviço” são apenas configurações possíveis; não existem tabelas específicas para esses conceitos.

Os únicos modos de duração são:

1. `fixed` — duração fixa;
2. `fixed_multiple` — duração fixa com múltiplos blocos;
3. `group_2` — duração definida pela opção do Grupo 2.

A página pública mantém a janela móvel de sete dias (hoje + seis dias), não uma semana fixa.

## Estrutura

- `src/app`: rotas, actions de autenticação e callback;
- `src/components`: UI aprovada, ainda conectada progressivamente aos dados reais;
- `src/lib/supabase`: clients SSR/browser e renovação da sessão;
- `src/lib/repositories`: acesso básico aos dados com tipos;
- `src/types/database.ts`: tipos do schema Supabase;
- `src/mocks`: dados ainda usados pelas telas não migradas;
- `supabase/migrations`: schema e RLS versionados;
- `supabase/tests/database`: testes pgTAP de isolamento;
- `supabase/seed.sql`: cenário local Arena Central, sem usuário/senha.

Veja [docs/database.md](docs/database.md) para o modelo, RLS, Super Admin e superfície pública.

## Ainda não implementado

- cadastro real e conclusão do onboarding;
- CRUD real em todas as telas administrativas;
- motor de disponibilidade, reservas concorrentes e criação pública de appointments;
- WhatsApp, pagamentos, financeiro, estoque, Google Calendar, IA e deploy.
