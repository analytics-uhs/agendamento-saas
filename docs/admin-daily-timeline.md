# Agenda diária — timeline contínua

A visualização do Grupo principal usa `DailyTimeline`, chamada pela `DailyAgendaPage`. O bloco superior de reservas complementares permanece independente e inalterado.

Antes, `DesktopDailyGrid` / `MobileDailyGrid` e `DailyGridRow` usavam `buildDailyCalendarRows`: a união da cadência com cada início de appointment/bloco criava linhas extras em :15/:30/:45. Essas renderizações foram substituídas, não sobrepostas à tabela antiga.

## Geometria

- Escala única de **96 px/hora**; somente horas cheias definem separadores.
- `top = (inícioEmMinutos − inícioDaTimeline) / 60 × 96`.
- `height = duraçãoVisívelEmMinutos / 60 × 96`.
- :15/:30/:45 ficam a 24/48/72 px dentro da mesma hora. Um evento 18:15–19:15 cruza a linha das 19h.
- Range comum considera janelas, appointments e blocks; arredonda os limites para horas inteiras. Dia sem dados mostra 08h–20h, com criação também acessível pelo botão Novo.
- Projeções de véspera do repository são respeitadas. Eventos que continuam amanhã são recortados em 24h sem alterar sua data/duração real.
- Sobreposições (inclusive histórico cancelado) dividem a largura em faixas para manter os detalhes acessíveis.

## Interação e responsividade

- Clique vazio converte Y em minutos e consulta `loadAdminAvailability`, já existente. Seleciona o candidato retornado mais próximo; não inventa grade no frontend nem aplica limites públicos. O Grupo secundário inicial é o mesmo do formulário existente; alterações nele continuam recalculando a disponibilidade no formulário.
- Setas movem a referência de teclado em 15 min; Enter realiza o mesmo snap na RPC. Respostas atrasadas após troca de data são ignoradas. Erro/ausência de slots gera feedback.
- Tablet/desktop: eixo e cabeçalhos sticky, largura mínima de 176 px por opção, rolagem horizontal acima de aproximadamente cinco opções no container Admin.
- Mobile: seletor de opção e mesma escala em uma coluna. O scroll vertical interno mantém cabeçalhos legíveis.
- Eventos curtos reduzem metadados; o card inteiro abre detalhes. Ações e informações completas continuam nos detalhes existentes. Lembrete permanece no card quando há espaço.
- Não há texto, sombreamento ou células de funcionamento fechado. O preenchimento de **blocks reais** continua existindo.

## Limites de escopo

Somente apresentação e integração com a leitura Admin existente. Sem migration, alteração de disponibilidade, concorrência, permissões, criação, recorrência, notificações ou fluxo público.

## Validação visual

Fixture local da `DailyAgendaPage` real, com Server Actions simuladas e dados sintéticos (nenhuma escrita remota). Cenários: 16:00 e 16:15 em opções distintas; 30/45/60/90 minutos; block 18:30–20:00; evento anterior ao funcionamento; tablet 768/1024, desktop com seis opções e mobile 390, claro/escuro. Esta revisão não representa um teste de criação em produção.
