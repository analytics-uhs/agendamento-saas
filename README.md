# AgendaFácil — agendamento-saas

SaaS multiempresa de agendamentos. A interface Next.js foi adaptada do MVP visual Lovable `analytics-uhs/vibrant-slot-wiz`; a arquitetura atual usa Next.js 16, TypeScript, App Router, Tailwind CSS 4 e Supabase.

## Estado atual

O projeto já possui autenticação, fundação multiempresa, configuração real do estabelecimento e gestão completa do MVP de agendamentos:

- login, logout, sessão SSR e proteção de `/admin` com Supabase Auth;
- modelo multiempresa isolado por estabelecimento;
- migrations, constraints, índices e Row Level Security (RLS);
- resolução do negócio atual do usuário autenticado;
- clients Supabase separados para browser, Server Components e proxy;
- repositories tipados e Server Actions autenticadas;
- RPCs anônimas curadas para configuração, disponibilidade e criação de reservas;
- onboarding real para o primeiro estabelecimento;
- persistência de Meu negócio, Configuração da agenda, Horários e Aparência;
- múltiplos períodos de funcionamento por dia, inclusive no onboarding;
- upload restrito de logos pelo Supabase Storage;
- criação atômica de appointments com proteção contra reservas concorrentes;
- Dashboard e Agenda administrativos com dados reais, detalhes e alteração segura de status;
- criação manual delegada ao mesmo motor de disponibilidade do fluxo público;
- painel Super Admin com métricas, negócios paginados, detalhe e ativação controlada;
- temas visuais binários (claro/escuro) e contatos públicos opcionais do estabelecimento;
- seed sem credenciais, testes pgTAP e testes unitários das regras de formulário e disponibilidade.
- notificações internas em tempo real e Web Push opt-in para novos agendamentos públicos.

A página pública e as telas administrativas leem o Supabase. Apenas o preview de Aparência conserva conteúdo fictício para permitir edição visual sem criar reservas.

## Configuração local

Copie `.env.example` para `.env.local` e configure:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
NEXT_PUBLIC_APP_DOMAIN=agenda.local
SUPABASE_SERVICE_ROLE_KEY=...
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:notifications@example.com
```

`NEXT_PUBLIC_SUPABASE_ANON_KEY` também é aceito para projetos que ainda usam a chave legada. `SUPABASE_SERVICE_ROLE_KEY` e a chave VAPID privada são usadas somente no servidor para despachar push; nunca são enviadas ao browser ou versionadas. A chave VAPID pública chega ao componente Admin por prop renderizada no servidor.

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

A experiência visual oferece somente tema claro ou escuro. O controle é um botão por ícone (lua quando o tema claro está ativo e sol quando o escuro está ativo). Valores legados `system` são normalizados para `light` e novos cadastros não persistem preferência do sistema.

## Estrutura

- `src/app`: rotas, actions de autenticação, onboarding e configurações;
- `src/components`: UI aprovada conectada progressivamente aos dados reais;
- `src/lib/supabase`: clients SSR/browser e renovação da sessão;
- `src/lib/repositories`: acesso tipado ao negócio, configurações, appointments, leitura pública e operações server-only de plataforma;
- `src/types/database.ts`: tipos do schema Supabase;
- `src/mocks`: dados ainda usados pelas telas não migradas;
- `supabase/migrations`: schema e RLS versionados;
- `supabase/tests/database`: testes pgTAP de isolamento e do motor de reservas;
- `supabase/seed.sql`: cenário local Arena Central, sem usuário/senha.

Veja [docs/database.md](docs/database.md) para o modelo, RLS, Super Admin e superfície pública.

## Motor público

A rota `/agendar/[slug]` carrega apenas a configuração pública curada. Ao escolher os grupos e uma data, consulta slots reais e respeita horário de funcionamento, data/hora atual, duração e appointments não cancelados. A navegação continua sendo uma janela móvel de sete dias: hoje + seis dias, com avanços e retornos de sete dias.

`fixed` oferece um bloco fixo; `fixed_multiple` calcula quantos blocos consecutivos cabem a partir do horário; `group_2` usa `duration_minutes` da opção ativa do Grupo 2. A criação é feita pela RPC transacional `create_public_appointment`, nunca por insert anônimo direto.

Cada dia pode ter várias janelas normalizadas, como `08:00–11:00` e `14:00–20:00`. A disponibilidade é gerada separadamente dentro de cada janela: o intervalo fechado não produz slots e nenhuma duração, inclusive múltiplos blocos ou duração do Grupo 2, pode atravessar seu limite. Períodos adjacentes são aceitos; períodos sobrepostos são rejeitados no formulário, na RPC de persistência e por constraint no banco.

A confirmação é devolvida pela RPC sem dados administrativos e mantida somente no `sessionStorage` do dispositivo, evitando dados pessoais na URL. Consulte [docs/database.md](docs/database.md) para as garantias de concorrência e a superfície pública.

O cabeçalho público pode exibir endereço e links opcionais para WhatsApp, Google Maps, Instagram e Facebook. A RPC retorna apenas esses campos públicos curados; tabelas administrativas continuam indisponíveis para `anon`. Links aceitam exclusivamente HTTP(S), abrem em nova aba e não recebem contexto da aba de origem.

### Concorrência por recurso

No MVP, o Grupo 1 define o recurso independente da agenda. Quando ele está ativo, cada `group_1_option_id` possui sua própria disponibilidade: duas quadras diferentes ou dois profissionais diferentes podem receber reservas no mesmo horário, mas a mesma quadra ou o mesmo profissional não pode ter intervalos sobrepostos. Quando o Grupo 1 está inativo, o estabelecimento inteiro é um único recurso e, portanto, só pode existir uma reserva por intervalo.

Essa é uma decisão estrutural do motor, embora os nomes “Quadra” e “Profissional” sejam apenas exemplos configuráveis. O Grupo 2 nunca define o recurso concorrente.

## Gestão administrativa

O Dashboard consulta appointments reais de hoje e dos próximos sete dias. A Agenda permite navegar por datas, abrir os detalhes do cliente, visualizar a origem e alterar um appointment `scheduled` para `completed`, `cancelled` ou `no_show`. Estados terminais não retornam automaticamente para `scheduled`.

### Recorrência administrativa semanal

Na Agenda, o administrador pode transformar a criação manual em uma série semanal. Cada série representa um único dia da semana e horário; segunda e quarta, por exemplo, são duas séries. A série pode ser permanente (`repeat_count = null`) ou limitada por uma quantidade total de ocorrências, contando a primeira data como ocorrência 1. O agendamento público permanece exclusivamente avulso.

Séries permanentes não geram registros infinitos: a RPC idempotente `materialize_recurring_appointments` mantém no máximo a janela futura de 90 dias. Séries limitadas geram no máximo `repeat_count`. Cada ocorrência passa pelo mesmo motor de duração, funcionamento e concorrência dos appointments avulsos; qualquer conflito na criação inicial desfaz toda a transação.

Um cancelamento recorrente pode atingir somente a ocorrência escolhida ou ela e as próximas. O segundo escopo cancela apenas ocorrências futuras `scheduled` e inativa a série sem apagar histórico. `completed` e `no_show` sempre afetam somente um appointment e nunca encerram a série. Não há edição de série no MVP: para mudar suas regras, encerre a série e crie outra.

A criação manual não faz `INSERT` direto. A RPC autenticada `create_admin_appointment` resolve o negócio pela membership da sessão e delega duração, funcionamento, disponibilidade e concorrência para `create_public_appointment`. A origem fica registrada como `admin`, com `created_by`; reservas do consumidor permanecem `public`.

Na Data API, `authenticated` conserva apenas `SELECT` em `appointments`, sempre filtrado pelas policies RLS do negócio. `INSERT`, `UPDATE` e `DELETE` diretos são revogados: criação passa pelas RPCs controladas, mudanças de status passam por `set_appointment_status` e não existe exclusão física no MVP.

### Notificações de agendamentos públicos

Cada appointment com origem `public` gera uma linha de `admin_notifications` por owner/admin atual do negócio. As mensagens usam somente nome do cliente, opções selecionadas, data e horário; labels configuráveis e dados técnicos não entram no conteúdo. Reservas administrativas, recorrências e mudanças de status não notificam nesta etapa.

O sino do Admin carrega as últimas notificações e o total não lido com RLS por destinatário. Inserts chegam por Supabase Realtime com filtro de `user_id`, e o canal é removido no cleanup. O cliente observa `SUBSCRIBED`, `CHANNEL_ERROR`, `TIMED_OUT` e `CLOSED`; depois de uma interrupção, a primeira reconexão recarrega o feed uma única vez para recuperar eventos perdidos, sem polling e sem duplicar itens. A leitura individual ou em lote passa por RPCs autenticadas. No mobile, o header conserva logo e ações, mas omite visualmente o nome do negócio.

Web Push é opt-in: a permissão só é solicitada após o clique em “Ativar notificações”. O Service Worker `public/push-sw.js` mostra o mesmo título/mensagem e abre ou foca `/admin`. Subscriptions ficam em `push_subscriptions`, vinculadas ao usuário e negócio, com endpoint único e mutação por RPC autenticada.

### PWA do painel administrativo

O Admin pode ser instalado como PWA no Android/Chromium e no iPhone/iPad. O manifest é servido em `/admin/manifest.webmanifest` e resolvido exclusivamente pela sessão autenticada: nome, nome curto, paleta e ícones pertencem ao negócio atual, sem receber `business_id` do browser. Os ícones autenticados de 192 px, 512 px e Apple Touch usam a logo pública persistente do negócio com margem e proporção preservadas; se ela estiver ausente ou indisponível, usam `src/app/icon.png`, que o Next.js publica em `/icon.png`.

O painel registra o mesmo `public/push-sw.js` já usado pelo Web Push. Não existe um segundo Service Worker nem cache offline amplo: a instalação continua exigindo rede, e autenticação, sessão e redirects funcionam como no navegador. Em modo `standalone`, o shell respeita as safe areas do aparelho e oculta a ação de instalação.

No Android/Chrome, “Instalar aplicativo” aparece quando o navegador fornece `beforeinstallprompt` e aciona o diálogo nativo. No iOS, a ação mostra as etapas do Safari: Compartilhar → Adicionar à Tela de Início → Adicionar. A permissão de notificações nunca é solicitada automaticamente; no iPhone, o Admin orienta instalar e abrir o PWA antes de oferecer a ativação do Web Push.

Depois do commit do appointment, a Server Action tenta despachar a fila usando VAPID e o client server-only com service role. Claims usam lease de cinco minutos e `SKIP LOCKED`; `push_dispatched_at` só é preenchido quando todas as subscriptions válidas daquele destinatário foram processadas. Entregas bem-sucedidas ficam registradas por notification/subscription, portanto um retry pula dispositivos que já receberam. Respostas definitivas `404`/`410` removem o endpoint expirado; falhas transitórias liberam o claim para nova tentativa. Quando não há subscription, o item é concluído explicitamente como `no_subscriptions`, evitando loop infinito. Nenhum desses efeitos secundários reverte o agendamento.

O dispatcher registra no servidor somente etapa, mensagem sanitizada, eventual `statusCode`, contagens e os booleanos `serviceRoleConfigured`, `vapidPublicConfigured`, `vapidPrivateConfigured` e `vapidSubjectConfigured`. Endpoints, chaves de subscription e secrets nunca entram nos logs. O Admin não apresenta uma subscription do navegador como ativa quando a configuração server-side está incompleta.

## Super Admin

As rotas `/super-admin` e `/super-admin/negocios` são protegidas no servidor pela allow-list privada `private.platform_admins`. O painel exibe métricas reais, busca e paginação calculadas no banco, configuração de cada negócio, membros e até 20 agendamentos recentes. E-mail de membro é retornado somente pela RPC administrativa controlada; `auth.users` nunca é exposto ao browser.

A ativação passa por `set_platform_business_active`, registra ator e horário e não exclui dados. Um negócio inativo continua acessível aos seus membros com um aviso no painel, mas sua página pública, disponibilidade e criação pública ou administrativa de appointments permanecem bloqueadas pelo banco. Owners podem editar os campos públicos do negócio, mas não conseguem alterar `active` diretamente pela Data API.

Não existe cadastro público de Super Admin. Consulte [docs/database.md](docs/database.md#promover-o-primeiro-super-admin) para o procedimento administrativo de promoção inicial.

No onboarding, o endereço público é gerado automaticamente a partir do nome completo. O usuário vê apenas o preview; se o slug já existir, a aplicação tenta sufixos numéricos simples, enquanto a constraint única do banco permanece a garantia definitiva.

## Ainda não implementado

- cadastro de novos usuários;
- planos, cobrança do SaaS, trial, limites, impersonação e relatórios avançados;
- integração automática com API do WhatsApp, pagamentos, financeiro, estoque, Google Calendar, IA e deploy.
