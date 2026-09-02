# Evolução dos Grupos do AgendaFácil

## Status do documento

- Tipo: análise e proposta de arquitetura.
- Estado: decisões arquiteturais do MVP aprovadas; implementação incremental em PRs empilhadas.
- Escopo: terminologia, catálogo, reservas combinadas, recursos por horário e por dia, concorrência, recorrências, bloqueios, frontend, Admin e migração.
- Fora do escopo atual: implementação, migrations, alterações no banco remoto, preços e recorrência complementar.

## Resumo executivo

A evolução recomendada é aditiva e compatível com o produto atual:

1. Adotar **Grupo principal**, **Grupo secundário** e **Grupo complementar** na UI, documentação e novas abstrações TypeScript.
2. Preservar os nomes técnicos existentes `group_1`, `group_2`, `group_1_option_id` e `group_2_option_id`.
3. Ampliar `booking_groups.position` para aceitar a posição `3`, correspondente ao Grupo complementar.
4. Reutilizar `booking_options` para as opções complementares.
5. Não representar recursos diários como appointments com horários fictícios.
6. Introduzir um agregado `reservations`, ligar appointments existentes por `reservation_id` e criar `reservation_resources` para recursos complementares.
7. Usar uma camada transacional de ocupação, `resource_allocations`, para garantir concorrência entre reservas e futuros bloqueios.
8. Manter as RPCs e os registros existentes funcionando durante a transição.

Essa abordagem adiciona a nova capacidade sem reescrever o motor atual e sem exigir reconfiguração dos negócios existentes.

## 1. Modelo atual

### 1.1 Grupo 1

O atual Grupo 1 será chamado de **Grupo principal**.

Hoje ele:

- corresponde a `booking_groups.position = 1`;
- armazena a seleção em `appointments.group_1_option_id`;
- identifica o recurso independente de concorrência da agenda;
- permite que opções diferentes coexistam no mesmo intervalo;
- usa o próprio `business_id` como recurso único quando está inativo.

A chave lógica de concorrência atual é:

```text
business_id
+ coalesce(group_1_option_id, business_id)
+ intervalo do appointment
```

A constraint GiST `appointments_no_overlapping_active_bookings` é a barreira final contra sobreposição. Intervalos são tratados como `[início, fim)`, permitindo reservas adjacentes.

### 1.2 Grupo 2

O atual Grupo 2 será chamado de **Grupo secundário**.

Hoje ele:

- corresponde a `booking_groups.position = 2`;
- armazena a seleção em `appointments.group_2_option_id`;
- representa uma segunda dimensão configurável;
- pode definir `duration_minutes` quando `duration_mode = group_2`;
- não participa da chave de concorrência.

Os únicos modos de duração permanecem:

- `fixed`;
- `fixed_multiple`;
- `group_2`.

Não deve ser criado um modo baseado no Grupo principal.

As opções do Grupo principal podem especializar apenas sua grade pública por um
modo explícito: `business` herda `business_hours`; `custom` substitui esse padrão
pelas janelas de `booking_option_hours`. A resolução pertence ao motor e preserva
a âncora real de cada janela, sem alterar duração ou concorrência. Essa capacidade
não se aplica ao Grupo secundário nem ao Grupo complementar nesta etapa.

### 1.3 Campo `required`

`booking_groups.required` é persistido e publicado, mas não controla efetivamente a opcionalidade do motor atual. Na prática:

- grupo ativo exige seleção;
- grupo inativo não participa;
- `required = false` não torna a seleção opcional.

Esse campo não deve ser usado implicitamente para modelar o Grupo complementar. Seu comportamento deve ser documentado ou revisado em uma evolução separada.

## 2. Limites reais da implementação atual

O código e o banco possuem os seguintes acoplamentos:

- `booking_groups.position` aceita somente `1` e `2`;
- onboarding e configuração esperam exatamente dois grupos;
- `BusinessForm.groups` é uma tupla com dois elementos;
- tipos públicos e administrativos usam `1 | 2`;
- repositories descartam ou rejeitam posições diferentes;
- todo appointment exige data, início, fim e duração;
- recorrências sempre têm dia da semana, horário, duração e blocos;
- bloqueios atuais são intervalos horários do Grupo principal;
- notificações administrativas são geradas por insert em `appointments` e descrevem um horário;
- lembretes via WhatsApp são associados a appointments;
- o fluxo público exige data e horário para confirmar;
- a Agenda consulta appointments, séries e opções, sem um agregado de reserva.

Consequentemente, uma reserva diária não cabe naturalmente em `appointments` sem horário fictício ou uma refatoração regressiva ampla.

## 3. Terminologia recomendada

| Produto e UI | Representação técnica |
|---|---|
| Grupo principal | `position = 1`, nomes legados `group_1_*` |
| Grupo secundário | `position = 2`, nomes legados `group_2_*` |
| Grupo complementar | `position = 3`, novas abstrações |
| Modo de reserva | `occupancy_mode` |
| Por horário | `time_slot` |
| Por dia | `day` |

Recomenda-se `occupancy_mode` no banco porque o campo descreve como o recurso ocupa disponibilidade. Na interface, o texto apresentado deve ser “Modo de reserva”.

Novas abstrações de aplicação devem trabalhar com papéis semânticos:

```ts
type GroupRole = "primary" | "secondary" | "complementary";
```

Um helper central deve mapear papéis para posições. Isso evita espalhar verificações `position === 3` por todo o produto.

## 4. Definição do Grupo complementar

O Grupo complementar é:

- opcional por negócio;
- genérico e configurável;
- formado por opções que representam recursos independentes;
- reservável isoladamente ou junto de uma reserva principal;
- concorrente por opção;
- capaz de ocupar um intervalo ou uma data inteira;
- independente do Grupo secundário e dos modos de duração atuais.

Exemplo inicial:

```text
Grupo principal: Quadras
├── Quadra 1
└── Quadra 2

Grupo complementar: Churrasqueiras
├── Churrasqueira 1
├── Churrasqueira 2
└── Churrasqueira 3

Modo de ocupação do complementar: day
```

Cada opção complementar é um recurso concorrente. Duas opções diferentes podem ser reservadas na mesma data; a mesma opção não.

O modelo não deve conter regras ou entidades específicas chamadas churrasqueira, quadra, profissional, serviço ou qualquer outro segmento.

## 5. Catálogo proposto

### 5.1 `booking_groups`

Evoluir a tabela para permitir:

```text
position: 1 | 2 | 3
occupancy_mode: null | time_slot | day
intent_name: texto opcional
```

Constraints recomendadas:

- posições 1 e 2: `occupancy_mode` deve ser nulo;
- posição 3: `occupancy_mode` deve ser obrigatório;
- no máximo um grupo em cada posição por negócio;
- somente um Grupo complementar no MVP.

### 5.2 `booking_options`

Continuar reutilizando a tabela atual para as opções das três posições. Isso preserva:

- tenant composto;
- RLS;
- ordenação;
- ativação e desativação;
- infraestrutura administrativa já existente.

### 5.3 Nome para o seletor de intenção

Labels atuais podem ser instruções, como “Selecione sua quadra”. Elas não produzem bons textos para o seletor inicial:

```text
Selecione sua quadra + Escolha a churrasqueira
```

`intent_name` deve representar um nome curto configurável, por exemplo:

- Quadra;
- Churrasqueira;
- Profissional;
- Equipamento.

`label` continua sendo o título ou instrução da etapa; `intent_name` serve ao seletor “O que você deseja reservar?”.

## 6. Agregado de reserva

### 6.1 `reservations`

Entidade que representa a intenção única do cliente:

```text
reservations
- id
- business_id
- customer_name
- customer_whatsapp
- source
- created_by
- created_at
- updated_at
```

Não se recomenda inicialmente um status global autoritativo. O estado real pertence aos componentes. A aplicação pode derivar estados como ativa, parcialmente cancelada ou cancelada.

### 6.2 Vínculo com appointments

Adicionar:

```text
appointments.reservation_id nullable
```

Appointments continuam sendo a autoridade para reservas temporais do Grupo principal. Registros antigos permanecem válidos com `reservation_id = null`.

### 6.3 `reservation_resources`

Entidade para os componentes complementares:

```text
reservation_resources
- id
- reservation_id
- business_id
- group_id
- option_id
- occupancy_mode
- reservation_date
- start_time nullable
- end_time nullable
- status
- option_name_snapshot
- group_name_snapshot
- created_at
- updated_at
```

Regras:

- `day`: início e fim devem ser nulos;
- `time_slot`: início e fim são obrigatórios e válidos;
- a opção precisa pertencer ao Grupo complementar do mesmo negócio;
- `occupancy_mode` é copiado no momento da reserva;
- snapshots preservam o histórico após renomear ou desativar opções.

### 6.4 Exemplo combinado

```text
Reservation ABC
├── Appointment
│   ├── Quadra 1
│   ├── 12/09/2026
│   └── 15:00–16:00
└── Reservation resource
    ├── Churrasqueira 2
    ├── 12/09/2026
    └── Reserva do dia
```

Essa separação permite futuramente cancelar somente a quadra, somente a churrasqueira ou toda a reserva.

## 7. Ocupação e concorrência

### 7.1 `resource_allocations`

Recomenda-se uma camada de ocupação sem mutação direta pelo cliente:

```text
resource_allocations
- id
- business_id
- option_id
- reservation_resource_id nullable
- resource_block_id nullable
- occupancy_mode
- allocation_date
- start_time nullable
- end_time nullable
- occupied_period tsrange generated
- active
```

Para `day`, o intervalo técnico seria:

```text
[12/09/2026 00:00, 13/09/2026 00:00)
```

Isso não representa uma reserva de `00:00–23:59`. É apenas a representação matemática fechada-aberta de uma data completa. A entidade de domínio e a UI continuam sem horário.

### 7.2 Exclusion constraint

```text
business_id WITH =
option_id WITH =
occupied_period WITH &&
WHERE active
```

Essa constraint impede sobreposição para a mesma opção complementar.

### 7.3 Criação transacional

A RPC deve:

1. validar autenticação ou contexto público;
2. validar negócio, grupos e opções;
3. adquirir advisory locks ordenados por recurso e data;
4. revalidar disponibilidade;
5. criar `reservations`;
6. criar o appointment principal, quando houver;
7. criar os recursos complementares;
8. criar as allocations;
9. concluir tudo na mesma transação.

Qualquer conflito deve reverter integralmente a reserva combinada. Locks ordenados evitam deadlocks caso uma reserva futura possua vários complementos.

## 8. RPCs

### 8.1 Preservar

Não remover nem renomear inicialmente:

- `get_booking_availability`;
- `create_public_appointment`;
- `create_admin_appointment`;
- RPCs de recorrência;
- RPCs de bloqueio;
- `set_appointment_status`.

### 8.2 Novas superfícies sugeridas

```text
get_public_reservation_page(slug)
get_complementary_availability(...)
create_public_reservation(payload jsonb)

get_admin_reservation_availability(...)
create_admin_reservation(payload jsonb)
cancel_reservation_resource(...)
cancel_reservation(...)
```

Um payload JSON é apropriado para intenções variáveis, desde que a função valide estritamente todas as chaves, posições, opções, tenant, modo, datas, horários e duração.

O novo fluxo não deve duplicar o booking engine. A parte crítica de `create_public_appointment` deve ser extraída para helper privado reutilizável pelas duas superfícies.

## 9. Fluxos públicos

### 9.1 Somente Grupo principal

Preserva o fluxo atual:

```text
Grupo principal
→ Grupo secundário, quando ativo
→ Data
→ Horário
→ Dados
→ Confirmação
```

Negócios sem Grupo complementar não recebem uma nova etapa inicial.

### 9.2 Somente Grupo complementar por dia

```text
Intenção
→ Data
→ Recurso disponível
→ Dados
→ Confirmação
```

Não consulta slots nem exige horário.

### 9.3 Reserva combinada

```text
Intenção
→ Grupo principal
→ Grupo secundário, quando ativo
→ Data
→ Horário
→ Grupo complementar disponível
→ Dados
→ Confirmação
```

O resumo deve separar explicitamente:

```text
Quadra 1
15:00–16:00

+

Churrasqueira 2
Reserva do dia

12/09/2026
```

### 9.4 Intenções configuráveis

Quando o complementar estiver ativo:

```text
{primary.intent_name}
{complementary.intent_name}
{primary.intent_name} + {complementary.intent_name}
```

Nenhum texto de segmento deve ser hardcoded.

## 10. Disponibilidade

### 10.1 Principal

Permanece no motor atual:

- business hours;
- múltiplas janelas;
- duração fixa, múltiplos blocos ou Grupo secundário;
- Grupo principal como recurso;
- appointments;
- bloqueios;
- exclusion constraint existente.

### 10.2 Complementar `time_slot`

No fluxo público, deve:

- usar a opção complementar como chave concorrente;
- respeitar `business_hours`;
- começar dentro de uma janela ativa do dia selecionado;
- exigir que a ocupação caiba integralmente na janela;
- verificar allocations e bloqueios complementares.

Quando combinado, possui intervalo próprio, inicialmente pré-preenchido com o intervalo do Grupo principal. A arquitetura não deve exigir que esses intervalos permaneçam iguais.

### 10.3 Complementar `day`

No fluxo público, deve:

- consultar somente a data;
- retornar cada opção como disponível ou indisponível;
- não gerar slots;
- aceitar somente uma data cujo dia possua ao menos uma janela ativa em `business_hours`;
- considerar qualquer allocation ativa sobre aquela data.

Não haverá calendário público independente para o Grupo complementar nesta primeira versão.

### 10.4 Exceção administrativa

O Admin segue o princípio já existente para appointments administrativos e pode reservar fora do horário público:

- Grupo principal fora das janelas configuradas;
- Grupo complementar `time_slot` fora das janelas configuradas;
- Grupo complementar `day` em um dia sem `business_hours` ativo;
- reserva combinada com componentes fora do horário público.

Essa exceção altera somente a validação de funcionamento. Ela não ignora integridade ou disponibilidade:

- o recurso precisa estar livre;
- `resource_allocations` continuam sendo consultadas;
- bloqueios continuam sendo respeitados;
- advisory locks e exclusion constraints continuam valendo;
- a criação combinada permanece atômica.

## 11. Recorrências

`appointment_series` deve permanecer inalterada conceitualmente:

- pertence ao Grupo principal;
- possui horário e duração;
- materializa appointments;
- não recebe automaticamente um Grupo complementar.

Para adicionar um complemento a uma ocorrência já materializada:

1. localizar o appointment da ocorrência;
2. criar ou reutilizar uma `reservation` para ele;
3. adicionar somente o recurso complementar daquela data.

Isso não altera a série nem ocorrências futuras.

Recorrência complementar deve ser tratada depois, por entidade própria, como `reservation_resource_series`. Não deve ser encaixada artificialmente em `appointment_series`.

## 12. Bloqueios

Os bloqueios existentes continuam:

- vinculados ao Grupo principal;
- temporais;
- operados pelas RPCs atuais;
- exibidos na agenda horária.

Para complementares, antes da ativação completa em produção deve ser introduzido:

```text
resource_blocks
- option_id
- occupancy_mode
- block_date
- start_time/end_time nullable
- reason
- recurrence metadata
```

Reservas e bloqueios complementares devem criar registros na mesma `resource_allocations`, garantindo concorrência por uma única exclusion constraint.

Um bloqueio diário permanece semanticamente sem horário.

## 13. Admin

### 13.1 Configuração e onboarding

Apresentar:

- Grupo principal;
- Grupo secundário;
- Grupo complementar.

Configuração complementar:

- ativo/inativo;
- nome exibido;
- nome curto para intenção;
- opções ordenáveis;
- modo “Por horário” ou “Por dia”.

Negócios existentes continuam com dois grupos. O complementar deve nascer desativado ou ausente, sem exigir qualquer reconfiguração.

### 13.2 Agenda

Direção recomendada:

```text
Reservas do dia
Churrasqueira 1 — Disponível
Churrasqueira 2 — João
Churrasqueira 3 — Maria

Agenda por horário
08:00
09:00
10:00
```

Um appointment combinado pode exibir um badge discreto, mas o recurso diário permanece na faixa superior.

### 13.3 Criação manual

O Admin deve escolher entre:

- somente principal;
- somente complementar;
- combinada.

O Admin pode criar reservas principais, complementares ou combinadas fora de `business_hours`, inclusive recursos `day` em dias sem funcionamento ativo. Para todos os componentes continuam obrigatórios autorização, data válida, ausência de conflito, respeito aos bloqueios e passagem pelas proteções transacionais do banco.

## 14. Cancelamento e status

Cada componente deve ter estado próprio.

Reserva combinada futura:

- cancelar somente o appointment principal;
- cancelar somente o `reservation_resource`;
- cancelar todos os componentes em uma RPC transacional.

Não se recomenda armazenar inicialmente um status global independente, pois ele pode divergir dos componentes. O estado agregado deve ser derivado.

Appointments continuam usando os estados atuais. Recursos complementares podem reutilizar a mesma semântica de bloqueio, em que todos os estados exceto `cancelled` ocupam disponibilidade.

## 15. Notificações e lembretes

O trigger atual cria notificações por appointment. O novo fluxo deve evitar notificações duplicadas.

Recomendação:

- novos fluxos geram uma notificação por `reservation`;
- o trigger legado continua atendendo appointments sem `reservation_id`;
- appointments criados pela nova RPC não disparam a notificação legada;
- `admin_notifications` pode receber `reservation_id` e manter `appointment_id` opcional;
- reservas somente complementares também notificam owners/admins;
- falha de Push continua sem reverter a reserva.

Lembretes atuais permanecem associados a appointments. Lembretes para reservas somente diárias devem ser generalizados posteriormente a partir de `reservation`.

## 16. Segurança e multiempresa

Todas as novas tabelas devem possuir:

- `business_id` explícito ou derivável com FK composta;
- RLS habilitado;
- leitura administrativa limitada a membros do negócio;
- mutações críticas somente por RPC;
- nenhum grant administrativo para `anon`;
- nenhuma service role no browser;
- Super Admin pela estratégia privada existente.

A superfície pública deve continuar curada por RPC e retornar somente:

- negócio ativo;
- grupos e opções ativos necessários ao fluxo;
- configuração de ocupação;
- disponibilidade sanitizada.

Não deve existir leitura anônima direta de reservations, resources, allocations ou blocks.

## 17. Compatibilidade e migração

A estratégia deve ser aditiva:

1. ampliar a constraint de posição;
2. adicionar colunas e tabelas novas;
3. manter o Grupo complementar ausente por padrão;
4. manter signatures atuais;
5. preservar appointments históricos;
6. aceitar `reservation_id = null`;
7. não exigir backfill imediato;
8. ativar novos dados apenas para negócios configurados.

Um backfill futuro pode criar uma reservation para cada appointment histórico, mas isso não é necessário para liberar a funcionalidade.

## 18. Alternativas consideradas

### 18.1 Renomear `group_1` e `group_2` no banco

Não recomendado. Impactaria constraints, triggers, RPCs, tipos, repositories, actions, testes, recorrências, bloqueios, Super Admin e notificações. O ganho seria principalmente cosmético.

### 18.2 Tabelas separadas para o catálogo complementar

Reduz o impacto em consumers `1 | 2`, mas duplica RLS, options, ordenação, configuração e repositories. Ampliar `booking_groups` é mais coerente.

### 18.3 Churrasqueira como appointment diário

Rejeitado porque exige horário fictício, mistura semânticas, interfere em duração, business hours, recorrência, notificações e Agenda.

### 18.4 Migrar tudo imediatamente para `reservation_items`

É conceitualmente uniforme, mas exigiria migrar appointments, séries, bloqueios, status, lembretes, notificações e edição em uma única evolução. O agregado compatível é mais seguro.

## 19. Riscos

- notificações duplicadas em reservas combinadas;
- consumers que descartam ou rejeitam `position = 3`;
- labels livres inadequadas para o seletor de intenção;
- divergência entre status de componentes e agregado;
- alteração do modo complementar com reservas futuras;
- corrida entre bloqueio e reserva sem allocation compartilhada;
- exposição pública antes de bloqueios complementares e demais barreiras estarem concluídos;
- aplicação acidental da exceção administrativa às RPCs públicas;
- erros de data próximos à meia-noite;
- perda de histórico após renomear ou desativar opções;
- novo fluxo aplicado involuntariamente a negócios antigos;
- inclusão prematura de recorrência ou preço.

O modo complementar não deve mudar enquanto houver ocupações futuras, ou cada reserva deve preservar seu snapshot do modo.

## 20. Testes necessários

### 20.1 Banco e pgTAP

- posição 3 aceita e posição 4 rejeita;
- opção complementar respeita tenant;
- `day` não aceita horários;
- `time_slot` exige intervalo;
- público `time_slot` precisa caber integralmente em `business_hours`;
- público `day` exige funcionamento ativo na data;
- Admin cria `time_slot` fora de `business_hours` sem ignorar conflitos;
- Admin cria `day` em data sem funcionamento ativo sem ignorar conflitos;
- mesma opção e data conflitam;
- opções diferentes na mesma data coexistem;
- concorrência real permite somente um vencedor;
- reserva combinada é all-or-nothing;
- usuário de outro negócio é bloqueado;
- anon não lê tabelas;
- bloqueio e reserva conflitam na mesma allocation;
- cancelar componente libera somente seu recurso;
- RPCs legadas continuam funcionando;
- appointments históricos continuam legíveis;
- recorrência principal permanece inalterada;
- complemento avulso não acompanha recorrência.

### 20.2 TypeScript e UI

- negócio sem complementar mantém fluxo atual;
- somente complementar `day` não mostra horário;
- reserva combinada separa intervalo e dia inteiro;
- intenções usam configuração, não hardcode;
- Admin separa reservas do dia;
- confirmação suporta componentes independentes;
- somente uma notificação é gerada;
- desktop, mobile, claro e escuro;
- paleta configurável;
- Super Admin interpreta posição 3 corretamente.

Toda a suíte existente de booking engine, recorrência, bloqueios, status, notificações, onboarding e RLS deve continuar passando.

## 21. Plano em PRs

### PR 1 — Terminologia compatível

- aliases `primary` e `secondary`;
- textos administrativos;
- helpers de papel e posição;
- documentação conceitual;
- nenhuma alteração de schema.

### PR 2 — Catálogo complementar

- posição 3;
- enum `occupancy_mode`;
- `intent_name`;
- constraints e RLS;
- tipos gerados;
- nenhum fluxo público novo.

### PR 3 — Agregado e motor de ocupação

- `reservations`;
- `reservation_resources`;
- `resource_allocations`;
- `appointments.reservation_id`;
- exclusion constraint;
- helpers privados;
- pgTAP de concorrência;
- sem UI.

### PR 4 — Configuração e onboarding

- Grupo complementar opcional;
- onboarding aceita dois ou três grupos;
- negócios existentes permanecem com dois;
- Super Admin e repositories atualizados;
- sem ativação pública automática.

### PR 5 — Disponibilidade e criação transacional

- disponibilidade complementar `day` e `time_slot`;
- validação pública baseada em `business_hours`;
- caminho administrativo fora do funcionamento sem contornar conflitos;
- `create_public_reservation`;
- `create_admin_reservation`;
- criação combinada atômica;
- compatibilidade com `create_public_appointment`;
- notificação única por reserva.

### PR 6 — Fluxo público “Combinar no início”

- seletor configurável de intenção;
- fluxo principal preservado;
- fluxo somente complementar;
- fluxo combinado;
- resumo e confirmação por componentes;
- mobile-first.

### PR 7 — Admin operacional

- criação manual nos três modos;
- detalhe agregado;
- faixa “Reservas do dia”;
- indicadores combinados;
- cancelamento por componente quando aprovado.

### PR 8 — Bloqueios complementares

- `resource_blocks`;
- bloqueios diários e temporais;
- mesma allocation/exclusion;
- visualização administrativa.

Implementada com séries semanais permanentes ou por quantidade, seleção atômica de múltiplas opções e cancelamento de uma ocorrência ou desta e das próximas. O Admin escolhe entre a agenda principal e o Grupo complementar somente quando o complemento está ativo; negócios legados mantêm o fluxo anterior sem etapa adicional.

Apesar da divisão incremental, a funcionalidade não deve ser exposta ao usuário final antes da conclusão desta PR e dos demais requisitos do critério de produção.

### Evoluções posteriores
- anexar complemento a ocorrências;
- preços por componente;
- preço de pacote;
- pagamentos e cobrança.

## 22. Critério de ativação em produção

As PRs podem ser desenvolvidas, revisadas e aplicadas incrementalmente. Código intermediário pode permanecer sem exposição ao usuário final.

O Grupo complementar só pode ser considerado pronto para ativação em produção quando estiverem concluídos, integrados e validados:

- catálogo e configuração do Grupo complementar;
- `reservations`, `reservation_resources` e `resource_allocations`;
- disponibilidade pública e administrativa;
- criação transacional e concorrência no banco;
- configuração e onboarding opcional;
- fluxo público “Combinar no início”;
- Admin operacional;
- bloqueios complementares compartilhando `resource_allocations`;
- testes de regressão das funcionalidades existentes.

Até esse marco, nenhum negócio deve receber a opção ativa do Grupo complementar, mesmo que migrations ou componentes intermediários já estejam presentes.

## 23. Documentação a atualizar após implementação

- `PRODUCT.md`: três papéis e intenções de reserva;
- `docs/database.md`: agregado, recursos, allocations e concorrência;
- `docs/design-system.md`: apenas se os padrões de reserva diária e resumo composto forem aprovados como reutilizáveis;
- `.impeccable/design.json`: apenas se houver evolução visual oficial;
- `README.md`: configuração e fluxos;
- `AGENTS.md`: somente se surgir uma nova regra obrigatória para futuras implementações.

## 24. Decisões aprovadas para o MVP

1. **Funcionamento público e exceção administrativa**
   - reservas públicas complementares seguem `business_hours`;
   - `time_slot` público precisa caber integralmente em uma janela válida;
   - `day` público exige funcionamento ativo na data;
   - não haverá calendário público independente nesta versão;
   - o Admin pode reservar fora do funcionamento, sem ignorar allocations, bloqueios, locks ou constraints.

2. **Quantidade de complementos**
   - a UI inicial permite selecionar um recurso complementar;
   - o schema deve permitir múltiplos recursos futuramente.

3. **Complementar `time_slot` combinado**
   - possui intervalo próprio;
   - começa pré-preenchido com o intervalo do Grupo principal;
   - a arquitetura não obriga igualdade entre os intervalos.

4. **Nome do seletor inicial**
   - usa `intent_name` configurável;
   - não é derivado automaticamente de `label`.

5. **Onboarding e compatibilidade**
   - Grupo complementar é opcional;
   - fica desativado ou ausente por padrão;
   - negócios existentes não precisam reconfigurar a agenda.

6. **Bloqueios e liberação para produção**
   - bloqueios complementares são obrigatórios antes da ativação completa;
   - reservas e bloqueios compartilham `resource_allocations` e a mesma proteção de concorrência.

## 25. Recomendação final

A opção de menor risco é preservar o motor temporal atual e adicionar uma camada de reserva agregada para coordenar componentes heterogêneos.

O Grupo principal continua sendo a autoridade temporal existente. O Grupo secundário permanece descritivo e responsável por duração quando configurado. O Grupo complementar entra como um novo catálogo de recursos com ocupação própria, sem contaminar appointments, recorrências ou bloqueios legados.

A combinação de `reservations`, `reservation_resources` e `resource_allocations` oferece:

- compatibilidade com negócios existentes;
- reserva diária semanticamente correta;
- concorrência garantida no banco;
- criação combinada atômica;
- cancelamento independente futuro;
- base para bloqueios, recorrência complementar e preços;
- migração incremental em PRs pequenas.

As decisões funcionais necessárias ao início da implementação estão fechadas. A execução deve seguir a sequência incremental proposta, mantendo o Grupo complementar sem exposição ao usuário final até que todo o critério de ativação em produção seja satisfeito.
