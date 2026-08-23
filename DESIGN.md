---
name: AgendaFácil
description: Agenda operacional clara, acolhedora e flexível para pequenos estabelecimentos.
colors:
  primary-default: "#E3613D"
  accent-default: "#F0BA40"
  brand-gray: "#545454"
  background-light: "#FFFFFF"
  surface-light: "#F7F7F7"
  foreground-light: "#292929"
  muted-light: "#6B6B6B"
  border-light: "#E2E2E2"
  background-dark: "#181818"
  surface-dark: "#242424"
  foreground-dark: "#F5F5F5"
  muted-dark: "#AAAAAA"
  border-dark: "#3A3A3A"
  success-light: "#35885B"
  success-dark: "#5CB984"
  danger-light: "#C44949"
  danger-dark: "#EF7171"
  on-primary: "#FFFFFF"
typography:
  headline:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: "32px"
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: "28px"
  body:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
  label:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: "20px"
  caption:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "16px"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary-default}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "44px"
  button-outline:
    backgroundColor: "{colors.background-light}"
    textColor: "{colors.foreground-light}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "44px"
  card:
    backgroundColor: "{colors.background-light}"
    textColor: "{colors.foreground-light}"
    rounded: "{rounded.md}"
    padding: "16px"
  input:
    backgroundColor: "{colors.background-light}"
    textColor: "{colors.foreground-light}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "44px"
---

# Design System: AgendaFácil

## Overview

**Creative North Star: "O Balcão Organizado"**

O AgendaFácil se comporta como uma ferramenta de trabalho diário bem preparada: informações importantes ficam visíveis, agrupadas e fáceis de operar. A expressão atual combina clareza e eficiência com calor humano, sem a frieza de software corporativo e sem informalidade infantil. É um produto moderno e profissional, cuja marca aparece em decisões precisas, não em decoração.

Este documento registra o **baseline atual**, não um limite permanente. `docs/design-system.md` continua sendo a referência técnica de implementação; oportunidades futuras só se tornam padrão depois de exploração explícita, aprovação e incorporação ao Design System.

**Key Characteristics:**
- Clara, acolhedora, operacional, confiável, moderna e profissional.
- Hierarquia direta, densidade confortável e ações importantes aparentes.
- Superfícies discretas, identidade configurável por negócio e decoração contida.
- Mobile-first no fluxo público e responsividade operacional no Admin.

## Colors

A identidade padrão combina a **Terracota de Ação** com o **Âmbar de Apoio** sobre neutros calmos. `primary` e `accent` são papéis configuráveis pela marca de cada estabelecimento; `success`, `danger` e a identificação do WhatsApp permanecem semânticos e não devem ser recoloridos pela paleta do negócio.

- **Terracota de Ação** (`#E3613D`): ação principal, seleção e orientação ativa da identidade padrão.
- **Âmbar de Apoio** (`#F0BA40`): avisos brandos e ênfase secundária; nunca compete com a ação principal.
- **Neutros claros** (`#FFFFFF`, `#F7F7F7`, `#292929`, `#6B6B6B`, `#E2E2E2`): estrutura, leitura e separação no tema claro.
- **Neutros escuros** (`#181818`, `#242424`, `#F5F5F5`, `#AAAAAA`, `#3A3A3A`): equivalentes funcionais no tema escuro.
- **Feedback semântico**: verde para sucesso e vermelho para erro/cancelamento, com variantes próprias por tema.

**The Useful Color Rule.** Cor indica marca, estado ou ação; ela não é preenchimento decorativo. Poucas cores por tela preservam a prioridade operacional.

## Typography

Arial com fallback Helvetica e sans-serif forma o sistema atual. É uma escolha neutra, familiar e altamente legível; títulos usam peso 600 e escala contida, textos operacionais predominam em 14px e metadados em 12px.

Uma assinatura tipográfica mais própria é uma oportunidade futura, não uma característica já implementada. Qualquer evolução deve preservar leitura rápida, suporte aos temas e consistência entre Admin e página pública.

## Layout

O Admin usa sidebar fixa no desktop, conteúdo central de até `64rem` e navegação inferior no mobile. O fluxo público é uma coluna mobile-first de até `28rem`. O ritmo recorrente usa 4, 8, 12, 16, 24 e 32px; `24px` separa cabeçalhos do conteúdo e blocos principais normalmente respiram em intervalos de 24px.

Desktop favorece visão geral e grids; mobile prioriza uma ação ou recurso por vez, áreas de toque confortáveis e safe areas da PWA. Densidade deve ser confortável: nem informação espremida, nem minimalismo que esconda ações essenciais.

## Elevation & Depth

A interface é **plana por padrão**. Contraste tonal, bordas, espaçamento e hierarquia criam profundidade estrutural. Sombras ficam reservadas a overlays, modais, popovers e elementos realmente elevados; cards comuns não recebem sombra apenas para parecerem destacados.

**The Flat First Rule.** Se borda, superfície e espaçamento resolvem a hierarquia, não adicione sombra.

## Shapes

Cantos de 8, 12 e 16px suavizam controles, cards e overlays; badges usam formato pill. Bordas finas organizam superfícies e estados. A geometria deve parecer acolhedora e moderna, nunca fofa, inflada ou excessivamente decorativa.

## Components

- **Botões e controles:** táteis, diretos e confiáveis. A ação primária é sólida; outline e ghost reduzem hierarquia; success, warning e danger preservam significado semântico. Foco visível é obrigatório.
- **Cards e containers:** contidos, organizados e discretos, normalmente com fundo de página, borda e raio de 12px.
- **Inputs e selects:** 44px de altura, fundo de card, borda, raio de 12px e rótulo sempre aparente.
- **Badges:** pequenos, semânticos e subordinados ao conteúdo; componentes de domínio fazem o mapeamento de status.
- **Navegação:** sidebar no desktop e barra inferior rolável no mobile, com ícones Lucide consistentes e estado ativo pela cor primária.
- **Modais e popovers:** são as principais superfícies elevadas; modal vira folha inferior no mobile e preserva Escape, clique externo e foco acessível.
- **Identidade do negócio:** logo, nome, tema e paleta aparecem no Admin e no fluxo público sem substituir cores semânticas.

## Do's and Don'ts

### Do:
- **Do** priorize clareza operacional, ações visíveis e linguagem direta.
- **Do** use contraste tonal, bordas e espaçamento antes de recorrer a sombras.
- **Do** diferencie a identidade padrão da plataforma dos tokens configuráveis do estabelecimento.
- **Do** trate tipografia, ritmo, microinterações e expressão de marca como oportunidades futuras legítimas quando houver exploração explícita.

### Don't:
- **Don't** transformar a interface em um dashboard SaaS genérico ou corporativo frio.
- **Don't** adicionar excesso de cor, ornamento, sombras ou efeitos que disputem atenção com a tarefa.
- **Don't** tornar a estética infantil, excessivamente arredondada ou inflada.
- **Don't** aumentar densidade a ponto de prejudicar leitura, nem simplificar a ponto de esconder ações importantes.
- **Don't** converter uma exploração futura em regra oficial antes de aprovação e atualização de `docs/design-system.md`.
