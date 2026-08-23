# AgendaFácil Design System

Este guia registra os padrões visuais que já existem no produto. Ele serve para manter consistência sem transformar a aplicação em uma biblioteca genérica e sem redesenhar telas aprovadas.

## Princípios

- Reutilize antes de criar. Os componentes-base ficam em `src/components/ui`.
- Preserve o comportamento, a hierarquia e o espaçamento da tela existente.
- Use tokens semânticos e as paletas do negócio; não fixe cores de marca no componente.
- Extraia apenas padrões repetidos. Uma necessidade isolada pode continuar local.
- Tailwind e Lucide continuam sendo as ferramentas visuais do projeto.

## Tokens

Os tokens ficam em `src/app/globals.css` e possuem equivalentes claros e escuros:

- superfícies: `background`, `surface`, `card`, `border`;
- texto: `foreground`, `muted`;
- identidade do negócio: `primary`, `accent`;
- feedback semântico: `success`, `danger`;
- foco: classe global `focus-ring`.

Use classes como `bg-background`, `text-muted`, `border-primary` e `text-danger`. Não substitua `success`, `danger` ou a cor própria do WhatsApp pela paleta do negócio. Não foi criado token adicional porque os valores repetidos atuais já têm representação semântica.

## Componentes

- `Button`: ação principal e variantes `outline`, `ghost`, `success`, `warning` e `danger`; tamanhos `sm`, `md` e `icon`. Botões somente com ícone precisam de `aria-label`.
- `PageHeader`: título, descrição opcional e ação responsiva. O `AdminShell` já fornece largura máxima e padding; não adicione outro page container.
- `Card`: borda, fundo e raio compartilhados. Use `as` para preservar `section`/`article` e `padding="sm|md|lg"` conforme o padrão da tela.
- `Badge`: camada exclusivamente visual com variantes semânticas. Componentes de domínio, como `StatusBadge`, fazem o mapeamento do status para a variante.
- `EmptyState`: estado vazio tracejado, com paddings `sm`, `md` e `lg`. Título/descrição adicionais continuam no conteúdo quando necessários.
- `Field`: `Label`, `Input` e `Select` com foco, altura e cores consistentes.
- `Modal`: título, conteúdo e fechamento por botão, Escape e clique externo; no mobile vira uma folha inferior. Reutilize-o antes de criar overlay próprio.
- `Switch`, `BusinessLogo`, `Logo`, `SocialIcons`: padrões existentes para alternância, marcas e redes sociais.

Não há `Section`, `FormSection`, `IconButton` ou popover genérico. As seções/formulários atuais variam funcionalmente; `Button size="icon"` cobre ações compactas; links compactos preservam semântica de link; e o sino é o único popover complexo.

## Layout

O `AdminShell` é responsável por `max-w-5xl`, centralização, padding, sidebar desktop, header mobile e espaço da navegação inferior. Páginas normalmente começam com `PageHeader`, usam `mt-6` entre cabeçalho e conteúdo e `space-y-6` entre blocos principais.

Cards padrão usam `rounded-xl border bg-background`. `bg-card` é reservado principalmente para controles e superfícies internas. Não envolva páginas Admin em um segundo container.

## Navegação

Reutilize obrigatoriamente:

- `adminSidebarItemClass`;
- `adminMobileNavItemClass`;
- `AdminMobileNavigationItem`.

Eles mantêm ícones, áreas de toque e alinhamento idênticos, inclusive para a ação de instalação da PWA. Não replique suas classes em um item separado.

## Formulários

Use `Label`, `Input`, `Select`, `Switch` e `Button`. O agrupamento comum é `space-y-2`; grades passam para duas ou mais colunas somente em breakpoints já usados pela tela. Mensagens de validação conservam `role="alert"`/`role="status"` e tokens de `danger`/`success`. Máscaras e validações pertencem à lógica existente, não aos componentes visuais.

## Feedback e status

`Badge` não conhece regras de negócio. Use wrappers como `StatusBadge`, `RecurringBadge` e `BusinessStatusBadge`. Ações destrutivas usam `Button variant="danger"`; conclusão usa `success`; não comparecimento usa `warning`. Estados vazios usam `EmptyState`; carregamentos podem combinar o componente com um ícone animado.

## Responsividade e PWA

- Mobile: header compacto, navegação inferior rolável, controles tocáveis e sem overflow horizontal acidental.
- Desktop: sidebar fixa e conteúdo central com `max-w-5xl`.
- Breakpoint estrutural principal do Admin: `lg`; adaptações internas normalmente usam `sm`/`md`.
- Preserve `safe-area`, modo standalone, service worker e fluxo de instalação definidos pelo shell/PWA.

## Acessibilidade

Mantenha foco visível com `focus-ring`, navegação por teclado e atributos `aria-*`. Controles sem texto visível exigem `aria-label`. Overlays devem expor `role="dialog"`, `aria-modal`, fechar por Escape e limpar listeners. Menus/popovers devem manter `aria-expanded` e `aria-haspopup` quando aplicável.

## Regras para agents

1. Antes de alterar interfaces, leia este arquivo e verifique `src/components/ui`.
2. Reutilize componentes existentes antes de criar novos.
3. Não copie grandes blocos Tailwind quando houver componente compartilhado.
4. Não crie variante visual se uma existente atender.
5. Use tokens semânticos, nunca cores hardcoded sem motivo de marca externa.
6. Preserve os tamanhos de ícone definidos pelo componente/padrão usado.
7. Em páginas Admin, deixe container e navegação sob responsabilidade do `AdminShell`.
8. Na navegação mobile, reutilize o componente e as classes compartilhadas.
9. Todo botão somente com ícone precisa de `aria-label`.
10. Procure neste Design System antes de criar um novo padrão.
11. Não altere padrões globais para resolver uma ocorrência isolada.
12. Se um padrão novo for realmente recorrente, incorpore-o aqui em vez de duplicá-lo localmente.
