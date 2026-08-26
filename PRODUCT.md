# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

O usuário principal é o proprietário ou administrador de um pequeno estabelecimento que precisa configurar, acompanhar e operar a agenda do negócio.

O consumidor final é um usuário secundário: ele acessa somente a página pública do estabelecimento para realizar um agendamento, sem precisar criar conta.

## Product Purpose

O AgendaFácil permite que pequenos estabelecimentos configurem sua operação de agendamento e disponibilizem uma experiência pública simples para seus clientes. O produto é bem-sucedido quando o estabelecimento consegue adaptar a agenda ao próprio contexto, administrar reservas e recorrências e manter o cliente informado, enquanto o consumidor conclui o agendamento sem atrito e sem cadastro.

## Positioning

O AgendaFácil é uma solução de agendamento flexível para diferentes segmentos. Seu mecanismo central usa grupos genéricos e configuráveis — Grupo principal, Grupo secundário e, na evolução aprovada, Grupo complementar — que permitem modelar recursos e ofertas sem fixar o produto em conceitos como profissional, serviço, quadra, esporte ou sala.

## Operating Context

- O estabelecimento cria e configura seu negócio no onboarding administrativo.
- Owners e admins operam a agenda, criam agendamentos avulsos ou recorrentes, alteram status e enviam lembretes por WhatsApp.
- O Grupo principal, quando ativo, representa o recurso independente de concorrência da agenda; sem ele, o estabelecimento funciona como um único recurso.
- O Grupo secundário representa uma segunda dimensão configurável e pode determinar a duração quando o modo escolhido for `group_2`.
- O consumidor seleciona opções, data e horário na página pública e recebe a confirmação sem autenticação.
- Notificações internas, Realtime, Web Push opt-in e PWA apoiam a operação diária do administrador.

## Capabilities and Constraints

- O sistema é SaaS multiempresa, com dados isolados por estabelecimento e papéis iniciais `owner` e `admin`.
- Grupo principal, Grupo secundário e Grupo complementar permanecem genéricos, configuráveis e independentes de segmentos específicos.
- Os únicos modos de duração são `fixed`, `fixed_multiple` e `group_2`; não existe duração baseada no Grupo principal.
- O funcionamento pode possuir múltiplos intervalos por dia, e nenhuma reserva pode atravessar uma janela fechada.
- A página pública usa uma janela móvel de sete dias consecutivos, iniciada em hoje mais os seis dias seguintes.
- Agendamentos públicos são avulsos. Recorrências semanais são criadas e administradas apenas no painel.
- A disponibilidade, a concorrência e as mutações críticas são validadas pelo motor de agendamento e por operações controladas no servidor.
- O consumidor não possui conta. Autenticação é destinada à administração do estabelecimento e ao Super Admin da plataforma.
- Integração automática com API do WhatsApp, pagamentos, financeiro, estoque, Google Calendar e IA não fazem parte do produto atual.

## Brand Commitments

- O nome oficial do produto é **AgendaFácil**.
- A comunicação deve ser clara, direta e acolhedora, sem expor tecnologias internas ao usuário.
- A identidade do estabelecimento pode personalizar a experiência pública e administrativa por logo, paleta e tema.
- A flexibilidade dos grupos genéricos é um compromisso de produto e não deve ser substituída por terminologia fixa de um segmento.

## Evidence on Hand

- O produto possui implementação funcional em Next.js com autenticação, multiempresa, onboarding, painel administrativo, página pública, motor de disponibilidade, recorrências, notificações e PWA.
- O MVP visual original foi baseado no repositório Lovable `analytics-uhs/vibrant-slot-wiz`; a implementação atual do AgendaFácil é a autoridade do produto em evolução.
- A identidade principal utiliza o arquivo `src/app/icon.png`; logos dos estabelecimentos são configuráveis.
- O modelo de dados, segurança e regras do motor estão documentados em `docs/database.md`.
- Os padrões de interface existentes estão documentados em `docs/design-system.md`.
- Não há depoimentos, métricas comerciais, clientes públicos, benchmarks ou provas de mercado documentados; trabalhos futuros não devem fabricá-los.

## Product Principles

1. Adaptar-se ao negócio sem impor terminologia ou estrutura de um segmento específico.
2. Manter a operação administrativa rápida, legível e confiável no uso diário.
3. Reduzir o atrito do consumidor com agendamento público sem cadastro.
4. Preservar isolamento multiempresa, autorização explícita e integridade das reservas.
5. Evoluir de forma incremental, reutilizando a fundação existente antes de ampliar o escopo.

## Accessibility & Inclusion

O produto deve funcionar em desktop e mobile, com temas claro e escuro, foco visível, navegação por teclado e nomes acessíveis para controles sem texto. A experiência pública deve continuar mobile-first e a administração deve preservar áreas de toque adequadas, legibilidade e suporte ao modo PWA.
