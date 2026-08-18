# AgendaFácil — agendamento-saas

Base frontend navegável de um SaaS de agendamentos para diferentes tipos de estabelecimento. Esta etapa usa somente dados mockados e serve para validar identidade visual, navegação, configuração e o fluxo público antes da implementação do backend.

## Referência visual

A experiência foi adaptada do MVP Lovable do repositório privado `analytics-uhs/vibrant-slot-wiz`. O projeto de referência foi analisado apenas para compreender telas, componentes, navegação, responsividade e identidade visual; sua arquitetura TanStack/Vite e seu conjunto amplo de dependências não foram copiados.

O projeto atual permanece em Next.js 16, TypeScript, App Router, `src/` e Tailwind CSS 4. A identidade padrão usa `#E3613D` como cor principal, `#F0BA40` como destaque, branco e `#545454`, com temas claro, escuro e preferência do sistema.

## Rotas disponíveis

- `/`: login visual;
- `/onboarding`: configuração inicial em cinco passos;
- `/admin`: dashboard;
- `/admin/agenda`: gestão mockada de agendamentos;
- `/admin/configuracao`: Grupos 1 e 2 e modos de duração;
- `/admin/horarios`: horários de funcionamento;
- `/admin/aparencia`: paletas e preview público;
- `/admin/negocio`: dados e link do negócio;
- `/agendar/studio-aurora`: página pública mobile-first;
- `/agendar/studio-aurora/confirmacao`: confirmação com resumo.

## Grupos configuráveis

O modelo não fixa conceitos como profissional, quadra, esporte ou serviço:

- Grupo 1: nome, estado ativo/inativo e opções configuráveis;
- Grupo 2: nome, estado ativo/inativo e opções configuráveis.

Os nomes mockados são “Profissional” e “Serviço”, apenas como demonstração. Um estabelecimento pode substituí-los por “Quadra” e “Esporte” ou por qualquer outro par.

## Modos de duração

Existem exatamente três modos:

1. duração fixa;
2. duração fixa + múltiplos blocos;
3. duração pelo Grupo 2.

Não existe duração pelo Grupo 1.

## Fluxo público

A página pública segue um fluxo progressivo: Grupo 1, Grupo 2, data, horário, dados do cliente e confirmação. Grupos inativos são omitidos. A seleção de data usa uma janela móvel de sete dias consecutivos, iniciada em hoje e nos seis dias seguintes. As setas movem a janela em sete dias e “Hoje” retorna à janela atual.

## Estrutura

- `src/app`: layouts e páginas do App Router;
- `src/components/admin`: shell e experiências administrativas;
- `src/components/booking`: fluxo público e faixa de datas;
- `src/components/onboarding`: wizard inicial;
- `src/components/ui`: elementos visuais reutilizáveis;
- `src/mocks`: estado e registros fictícios;
- `src/types`: tipos do domínio;
- `src/lib`: datas, horários, classes e utilitários.

## Executar localmente

```bash
npm install
npm run dev
```

## Fora desta etapa

Ainda não há autenticação real, API, banco de dados, Supabase, migrations, WhatsApp, pagamentos, financeiro, estoque, Google Calendar, IA ou deploy. Ações e edições vivem somente na memória e são reiniciadas ao recarregar a página. O upload de logo é apenas uma affordance visual.
