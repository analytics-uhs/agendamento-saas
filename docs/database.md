# Fundação Supabase

## Modelo e relacionamentos

`profiles` estende `auth.users` em uma relação 1:1 e não duplica e-mail. O trigger `on_auth_user_created` cria o perfil automaticamente.

`businesses` representa o estabelecimento e guarda também os contatos públicos opcionais `address`, `google_maps_url`, `instagram_url` e `facebook_url`. Os três links aceitam somente HTTP(S) e têm constraints de tamanho e protocolo no banco. `business_members` é a relação N:N entre usuários e empresas e começa com os papéis `owner` e `admin`; não existe a premissa de um único usuário por negócio.

Todos os registros de negócio carregam ou derivam `business_id`:

- `booking_groups`: posições 1 e 2 preservam os grupos principal/secundário; a posição 3 cataloga o Grupo complementar opcional e define `time_slot` ou `day`;
- `booking_options`: opções genéricas ligadas ao grupo; `duration_minutes` serve ao modo `group_2`;
- `business_hours`: janelas normalizadas por dia, de 0 (domingo) a 6 (sábado); cada linha representa um único período de funcionamento;
- `business_settings`: duração, paleta e preferência de tema;
- `appointments`: reservas públicas ou administrativas; `source` registra `public`/`admin`, e os estados não cancelados bloqueiam disponibilidade.
- `appointment_series`: definição administrativa de uma recorrência semanal em um único dia/horário; `repeat_count` nulo significa permanente e `appointments.series_id` distingue ocorrências materializadas de reservas avulsas.
- `reservations`: intenção agregada que futuramente coordena um appointment principal e um ou mais componentes complementares;
- `reservation_resources`: componentes complementares com modo de ocupação e nomes do catálogo preservados como snapshots;
- `resource_allocations`: barreira única de concorrência dos recursos complementares.
- `resource_blocks` e `resource_block_series`: indisponibilidades avulsas ou semanais dos recursos complementares; cada ocorrência ocupa a mesma barreira de `resource_allocations` usada pelas reservas.

Foreign keys compostas impedem que opções de outra empresa sejam referenciadas. Um trigger também valida que `group_1_option_id` e `group_2_option_id` apontem para as posições lógicas corretas. Outro trigger impede remover ou rebaixar o último owner.

## Multiempresa e RLS

`business_modules` registra `scheduling`, `management` e `fiscal` por negócio.
O backfill e o trigger de novos negócios inicializam Agenda ativa e Gestão/Fiscal
inativos. Membros têm somente leitura via RLS, sem ativação pelo cliente.
Detalhes de defaults, atomicidade, navegação e guard server-side em
[Módulos por negócio](architecture-business-modules.md).

O módulo Gestão inicia seu modelo com `product_categories` e `products`, ambos
protegidos simultaneamente por membership administrativa, módulo ativo e RLS.
A FK composta impede categoria de outro tenant; SKU/barcode são únicos dentro
do negócio. Preços usam `numeric`, e `minimum_stock` é configuração — não saldo.
Não existe coluna de estoque atual: o saldo futuro será derivado de movimentos.
Veja [Catálogo de produtos](architecture-product-catalog.md).

O saldo operacional é derivado exclusivamente do ledger imutável
`stock_movements`; não existe saldo armazenado em `products`. Entradas, saídas,
ajustes, perdas e estornos são deltas assinados, e a view
`product_stock_balances` soma o histórico incluindo produtos sem movimentos com
saldo zero. Estorno cria movimento compensatório e nunca edita/apaga o original.
Detalhes em [Motor de estoque](architecture-stock-ledger.md).

`purchases` e `purchase_items` mantêm o registro comercial mínimo de compras.
Rascunhos não afetam o estoque. `confirm_admin_purchase` recalcula o total e,
na mesma transação, cria um `stock_movements` positivo por item; origem única
`(source_type='purchase', source_id=purchase_item.id)` impede dupla entrada.
Compras confirmadas são somente leitura. Não há cancelamento, financeiro,
fornecedor estruturado, fiscal ou custo médio nesta etapa.

`sales` e `sale_items` registram o PDV mínimo. Draft não altera saldo;
`complete_admin_sale` exige um pagamento `pix`, `cash` ou `card`, recalcula o
total e grava uma saída negativa `sale` por item na mesma transação. O índice
único da origem torna a finalização idempotente e estoque negativo é permitido.
Vendas finalizadas são somente leitura. Não há caixa, recebíveis, cancelamento,
devolução, fiscal ou integração com Agenda.

## Financeiro mínimo

`financial_entries` registra `income`/`expense` com valor positivo `numeric(14,2)`,
data comercial, descrição, método opcional (`pix`, `cash`, `card`, `other`) e status
`paid`/`pending`. A tela `/admin/financeiro` usa mês atual em America/Sao_Paulo por
padrão, seletor mensal e listagem paginada. O resumo agrega **todo o mês**, somando
somente pagos: entradas menos saídas; pendentes não entram no saldo realizado.

Origens: `manual`, `sale`, `reservation` e `appointment` legado. A reserva agregada
é a origem comercial quando há `appointments.reservation_id`; sem esse vínculo,
o próprio appointment (incluindo ocorrências recorrentes) é a origem estável.
A RPC canonicaliza a origem e o índice único `(source_type,source_id)` impede
cobrança duplicada via componentes diferentes da mesma reserva. FKs compostas
validam sale/reservation; appointments usam a PK existente e trigger de tenant,
sem alterar o schema operacional. Não existe cadastro `clients` nem preço
persistido no booking: o Admin informa o valor total manualmente no detalhe.

`create_admin_financial_entry` permite manual ou Agenda, exige owner/admin e
`management`, deriva o negócio da membership e nunca aceita `business_id` do
cliente. `get_admin_financial_summary` tem a mesma autorização. A tabela concede
somente SELECT autenticado com RLS; mutações passam pelas RPCs. Lançamentos são
somente criação/leitura nesta fase (incluindo pendentes), sem edição ou exclusão.

A migration `20260905010000_financial_foundation.sql` redefine somente
`complete_admin_sale`: status completed, saída de estoque e income paid pelo
total final são gravados na mesma transação; uma falha reverte tudo. Vendas com
total zero permanecem draft, pois lançamento financeiro exige valor positivo.
O recebimento automático vale para finalizações a partir da migration, sem
backfill de vendas históricas. Estoque negativo permanece permitido.

Agenda não gera financeiro ao criar/concluir/cancelar: registro é explícito,
sem alterar status operacional. Compras confirmadas não geram expense.
Sem caixa, parcelas, pagamento parcial, financeiro recorrente, estorno ou fiscal.

Todas as tabelas expostas têm RLS habilitado. Funções auxiliares em `private` consultam membership sem recursão de policies e usam `security definer` com `search_path` fixo:

- `private.is_business_member(business_id)`;
- `private.has_business_role(business_id, roles[])`;
- `private.is_platform_admin()`.

Um usuário autenticado lê e altera somente o próprio profile. Membros leem o negócio e seus dados. `owner` e `admin` gerenciam configurações, opções, horários e appointments; somente `owner` gerencia memberships. Toda operação continua limitada ao `business_id` autorizado. O frontend nunca escolhe livremente um `business_id`: pages e Server Actions resolvem a primeira membership da sessão.

`public.create_business_with_owner` é a primitiva atômica de onboarding: cria negócio, owner, dois grupos, sete dias de horários e settings padrão. Inserção direta em `businesses` não é concedida ao cliente autenticado.

## Ordem inicial do agendamento público

`business_settings.public_booking_start_order` é `text NOT NULL DEFAULT
'service_first'`, limitado por check a `service_first` e `date_first`. O padrão
preserva negócios existentes. Em **Admin → Horários**, “Ordem do agendamento
público” é salva por Server Action autenticada, com tenant derivado da sessão e
as policies/grants existentes. `get_public_booking_page` publica somente esse
valor adicional nos settings curados.

`publicBookingSteps` continua sendo a única sequência de navegação, progresso e
Voltar. Data primeiro move Data antes dos grupos principal/secundário, mas mantém
intent na primeira posição. A data fica em rascunho até completar os grupos
necessários; só então se consulta a disponibilidade existente. Mudança de grupo
preserva a data, e mudança de data preserva grupos, invalidando horário/blocos e
complemento dependente. Não há regras de slots duplicadas no browser.

Complementar-only preserva a dependência atual nas duas ordens: `day` consulta
recursos após Data; `time_slot` consulta recursos após Data e Horário. Combined
reordena apenas Data e grupos principais, mantendo o complementar após Horário.
Nenhuma RPC de disponibilidade/criação ou regra do motor muda com essa opção.

## Antecedência mínima pública

`business_settings.minimum_booking_notice_minutes` é inteiro não negativo,
`NOT NULL DEFAULT 60`. Negócios existentes e novos adotam uma hora; zero mantém
os filtros temporais legados. Em **Admin → Horários**, o campo “Antecedência mínima”
é salvo por Server Action com tenant derivado da sessão e RLS existente.

`private.public_booking_notice_is_valid` compara a data/hora inicial em
`America/Sao_Paulo` com o relógio confiável `statement_timestamp()` mais a
antecedência. O limite é inclusivo, preserva segundos, minutos quebrados e troca
de dia. O relógio privado não aceita parâmetro/GUC do cliente; pgTAP o substitui
somente em transação privilegiada com rollback.

O filtro atua na disponibilidade principal pública e é revalidado em
`create_public_appointment`, inclusive quando chamada por `create_public_reservation`.
Em `fixed_multiple`, só o primeiro bloco define a antecedência; duração por
Secundário não muda a regra. O predicado público complementar aplica a mesma
regra a `time_slot`, nunca a `day`. `get_public_complementary_time_slots` retorna
somente início/duração/max_blocks de intervalos com opção livre, reutilizando a
disponibilidade complementar existente, sem publicar dados administrativos.

Admin usa o caminho privado com `p_enforce_hours=false` e suas RPCs de criação
próprias: não recebe antecedência pública. Conflitos, bloqueios, allocations,
recorrência e permissões permanecem inalterados. Não se adicionou configuração
ao payload de metadata público nem regra de relógio no browser.

## Super Admin

Super Admin não é uma coluna editável pelo cliente. A allow-list `private.platform_admins` fica fora dos schemas expostos pela Data API, sem grants para `anon` ou `authenticated` e com RLS habilitado. Somente operações privilegiadas de plataforma (SQL administrativo ou backend confiável futuro) podem provisioná-la. As policies consultam a allow-list pela função privada `is_platform_admin()`.

As rotas `/super-admin` e suas subrotas verificam a sessão e chamam `is_current_user_platform_admin()` em Server Components. Componentes, links e redirects são apenas UX: cada RPC global também revalida `private.is_platform_admin()` antes de acessar qualquer empresa. Usuários comuns continuam sob as policies multiempresa existentes.

As operações disponíveis no MVP são:

- `get_platform_metrics()` — totais agregados da plataforma;
- `list_platform_businesses(...)` — busca, filtro e paginação server-side de 20 itens;
- `get_platform_business_detail(id)` — configuração, membros, resumos e até 20 appointments recentes;
- `set_platform_business_active(id, active)` — ativação/inativação auditada por ator e horário.

As funções são `security definer`, têm `search_path` vazio, não são concedidas a `anon` e executam somente após a verificação explícita da allow-list. A RPC de detalhe retorna nome e e-mail dos membros, mas nenhum token ou metadado de autenticação.

### Promover o primeiro Super Admin

Não existe endpoint ou tela de autopromoção. Um operador com acesso administrativo ao banco deve localizar o UUID de um usuário autenticado existente e inserir a allow-list pelo SQL Editor do Supabase:

```sql
select id, email
from auth.users
where email = '<email-do-usuario-existente>';

insert into private.platform_admins (user_id, created_by)
values ('<auth-user-id>', '<auth-user-id>');
```

O e-mail é usado apenas para localizar o UUID durante a operação privilegiada; a autorização em runtime depende exclusivamente da relação com `auth.users.id`. Promoções seguintes devem preencher `created_by` com o UUID do administrador responsável. A tabela privada não possui grants para clientes autenticados.

### Negócios inativos

Somente `set_platform_business_active` altera `businesses.active`. O grant genérico de `UPDATE` foi substituído por grants de coluna para `name`, `slug`, `whatsapp`, `logo_url`, `address`, `google_maps_url`, `instagram_url` e `facebook_url`, impedindo que owner/admin se reative pela Data API.

Um negócio inativo preserva membros, configurações e histórico. Seus proprietários continuam acessando `/admin` e veem um aviso, mas não podem criar novos agendamentos. `get_public_booking_page` deixa de publicar o negócio, `get_booking_availability` retorna uma lista vazia e `create_public_appointment` rejeita a criação. Como `create_admin_appointment` delega ao mesmo motor, a criação administrativa também é rejeitada. A reativação restaura a superfície pública sem recriar dados.

## Página pública e motor de reservas

`anon` não possui privileges diretos sobre as tabelas administrativas nem sobre `appointments`. A superfície pública é limitada a três RPCs `security definer`, todas com `search_path` fixo:

- `get_public_booking_page(slug)`: retorna a configuração curada necessária para renderizar a página;
- `get_booking_availability(slug, date, group_1_option_id, group_2_option_id)`: retorna somente início, duração base e quantidade de blocos consecutivos;
- `create_public_appointment(...)`: revalida todos os dados e cria a reserva atomicamente, retornando somente uma confirmação sanitizada.

A configuração pública contém apenas:

- nome, slug, WhatsApp, logo, endereço e links sociais/localização opcionais de um negócio ativo;
- grupos e opções ativos;
- horários ativos;
- settings indispensáveis para renderização e duração.

Profiles, memberships, appointments existentes e dados de outros clientes nunca são retornados. Os IDs públicos de negócio e opções são usados apenas como referências opacas e são revalidados contra o slug e o estado ativo no banco.

Os links públicos são normalizados na aplicação e validados novamente por constraints. Protocolos executáveis, como `javascript:` e `data:`, são rejeitados. A interface usa nova aba com `noopener noreferrer`. A RPC não concede `SELECT` anônimo em `businesses` nem inclui `active`, timestamps ou outros campos administrativos.

### Disponibilidade e duração

Os horários começam na abertura e avançam pela duração base. Dias fechados, datas passadas, horários já iniciados no dia atual e intervalos que ultrapassam o fechamento não são oferecidos. Appointments `scheduled`, `completed` e `no_show` bloqueiam; `cancelled` não bloqueia.

Um dia pode conter várias linhas em `business_hours`. O motor gera candidatos separadamente em cada janela ativa e exige que o appointment inteiro caiba em uma delas. Assim, com `08:00–11:00` e `14:00–20:00`, não existem slots no almoço nem um appointment `10:30–11:30`. A mesma regra é reutilizada pela criação pública, criação administrativa e materialização de séries semanais.

A constraint `business_hours_no_overlapping_windows` usa intervalos `[início, fim)`: duplicatas e sobreposições no mesmo negócio/dia são rejeitadas, mas `08:00–11:00` seguido de `11:00–14:00` é válido. A RPC autenticada `replace_business_hours` troca atomicamente todas as janelas do negócio resolvido pela membership, sem ampliar os grants diretos ou permitir a escolha de outro `business_id`.

`business_hours` também permanece o horário padrão das opções do Grupo principal.
Cada `booking_option` possui um `schedule_mode` explícito: `business` (padrão
retrocompatível) usa exclusivamente o horário geral; `custom` usa exclusivamente
as múltiplas janelas normalizadas de `booking_option_hours`. O custom substitui,
não intersecta nem faz fallback para o horário geral. Ausência de janelas em um
dia significa recurso fechado, inclusive quando o negócio está aberto.

Cada janela efetiva ancora sua própria grade: `18:15–23:15` com 60 minutos gera
`18:15`, `19:15`, …, `22:15`; intervalos separados nunca são atravessados. O fim
informado como `00:00` reutiliza a representação canônica `24:00`. A RPC
`set_admin_booking_option_schedule` troca o modo e substitui todas as janelas
custom de forma transacional para owner/admin. Ao retornar a `business`, preserva
as janelas custom armazenadas, mas as ignora, permitindo reativação posterior sem
redigitação. A UI envia as sete entradas diárias explicitamente; não há
cópia mágica de `business_hours` no banco.

No Admin, em Configuração da agenda, cada opção salva do Grupo principal possui
um editor expansível de **Horário de disponibilidade**. O modo herdado não exibe
edição semanal; o modo personalizado reutiliza o editor de múltiplos períodos,
com campos empilhados no mobile e validação de sobreposição/meia-noite.
Na primeira personalização sem janelas armazenadas, os horários gerais são
copiados somente para o rascunho visual. Um custom vazio permanece fechado.
Alternar modos ou recolher o editor mantém o rascunho local; sair da página sem
salvar não o persiste. Ao salvar business, a RPC recebe somente modo e opção,
preservando janelas custom armazenadas. Novas opções precisam primeiro ser salvas
na configuração para obter seu ID, sem reload manual.

`loadOptionSchedule`/`saveOptionSchedule` usam o repository `option-schedules`,
resolvem o negócio pela sessão e restringem a opção ao Grupo principal desse
tenant. O browser não lê tabelas diretamente. O único write de horário passa por
`set_admin_booking_option_schedule`; não há lógica de disponibilidade no editor.

Essas janelas limitam a disponibilidade e a criação públicas. A criação Admin
continua permitida fora delas, respeitando conflitos, bloqueios, tenant e
constraints. Para opções `custom`, a disponibilidade Admin estende a cadência das
janelas efetivas por todo o dia, sem acrescentar uma grade paralela de horas cheias.
Com duração de 60 minutos e janela 18:15–23:15, oferece 00:15, 01:15, …, 23:15;
o último início termina no dia seguinte, permitido pela exceção administrativa. Janelas com a mesma cadência não duplicam slots;
cadências distintas explicitamente configuradas são preservadas. Dias custom sem
janelas usam a grade diária iniciada à meia-noite. Opções `business` mantêm o
comportamento legado. Na edição, o início já salvo também é preservado, mesmo fora
da cadência atual, sujeito às mesmas verificações de conflito.

- `fixed`: exatamente um bloco de `fixed_duration_minutes`;
- `fixed_multiple`: a RPC informa quantos blocos livres e consecutivos cabem em cada início;
- `group_2`: usa `duration_minutes` da opção ativa do Grupo secundário e aceita exatamente um bloco.

### Modelo de recurso

No MVP, a opção selecionada do Grupo principal é a identidade do recurso independente da agenda. A representação técnica permanece `position = 1` e `group_1_*`:

- `Grupo principal = Quadra`: cada quadra pode receber uma reserva simultânea;
- `Grupo principal = Profissional`: cada profissional possui disponibilidade independente;
- Grupo principal inativo: o estabelecimento inteiro é um único recurso.

Consequentemente, opções diferentes do Grupo principal podem ter appointments no mesmo intervalo, enquanto appointments da mesma opção não podem se sobrepor. Sem Grupo principal ativo, dois appointments do negócio no mesmo intervalo entram em conflito. O Grupo secundário classifica a reserva e pode definir sua duração, mas nunca altera o escopo de concorrência.

Essa regra é uma decisão estrutural do motor, não uma inferência baseada no nome configurado para o grupo. Internamente, a chave do recurso é `group_1_option_id` quando aplicável e `business_id` quando não há Grupo principal ativo.

O MVP usa `America/Sao_Paulo` para definir “agora”; uma configuração de fuso por estabelecimento deve preceder expansão internacional.

### Concorrência e atomicidade

Antes do insert, `create_public_appointment` obtém um advisory transaction lock por negócio/data e repete toda a validação de conflito. A constraint GiST `appointments_no_overlapping_active_bookings` é uma segunda barreira no banco para intervalos sobrepostos do mesmo recurso. Intervalos usam limites `[início, fim)`, portanto `09:00–09:30` e `09:30–10:00` são adjacentes e válidos.

Duas requisições para o mesmo slot são serializadas; a segunda recebe `booking_conflict` (`23P01`). A Server Action converte isso em mensagem amigável e recarrega a disponibilidade. O cliente nunca recebe mensagens internas do PostgreSQL.

### Agregado e ocupação de recursos complementares

`reservations` não possui status global autoritativo: o estado pertence a seus componentes. `appointments.reservation_id` é opcional e usa FK composta com `business_id`; todos os registros históricos permanecem válidos com `null`, sem backfill ou mudança no motor atual. Appointments continuam sendo a autoridade temporal e a constraint de concorrência do Grupo principal.

`reservation_resources` representa somente componentes do Grupo complementar. A opção deve pertencer ao grupo de posição 3 do mesmo negócio. `occupancy_mode`, nome da opção e nome do grupo são snapshots imutáveis, portanto renomear ou reconfigurar o catálogo não altera o histórico. Em `day`, a entidade armazena apenas `reservation_date`, sem horários fictícios; em `time_slot`, início e fim são obrigatórios e precisam formar um intervalo válido.

Cada componente cria na mesma transação uma `resource_allocation`. O produto já opera appointments e horários como data/hora civil local e usa `America/Sao_Paulo` para “agora”; por compatibilidade, allocations também usam `tsrange`, sem misturar timestamps UTC. Um componente `day` é convertido somente na barreira técnica para `[data 00:00, data seguinte 00:00)`. Um `time_slot` usa `[data + início, data + fim)`. A exclusion constraint GiST combina `business_id`, `option_id` e sobreposição de `occupied_period`, aceitando intervalos adjacentes e opções diferentes.

Todos os estados exceto `cancelled` mantêm a allocation ativa. O helper privado de mudança de status e o trigger de sincronização desativam a allocation atomicamente ao cancelar; isso permite que uma futura RPC cancele apenas o complemento sem afetar o appointment. As primitivas privadas de criação não possuem grants para clientes e foram desenhadas para participar da mesma transação de uma futura RPC combinada. `anon` não lê nenhuma das três tabelas; membros autenticados possuem somente leitura do próprio negócio via RLS, e mutações diretas continuam revogadas.

### Disponibilidade e criação agregada pública

`get_public_complementary_availability(slug, date, start_time, end_time)` é a superfície anônima curada do Grupo complementar. Ela publica somente o nome configurado, `intent_name`, modo de ocupação e opções ativas com um booleano de disponibilidade. IDs internos de negócio, allocations brutas e dados de clientes não são retornados.

`get_public_booking_page` inclui `intent_name` e `occupancy_mode` exclusivamente no objeto do Grupo complementar. Negócios legados e objetos dos Grupos principal/secundário preservam o formato anterior, permitindo que a página omita totalmente o seletor de intenção quando não existe complemento ativo.

- `day`: não aceita horários, exige pelo menos uma janela ativa de `business_hours` no weekday e verifica a opção no intervalo técnico da data inteira;
- `time_slot`: exige início/fim futuros e inteiramente contidos em uma única janela ativa; intervals adjacentes continuam válidos;
- grupo ou opção inativos não são publicados;
- a consulta é somente leitura e não cria locks persistentes ou registros.

`create_public_reservation(slug, payload)` cria de forma transacional uma reserva somente principal, somente complementar ou combinada. A RPC valida estritamente as chaves do payload, resolve grupo/opção pelo catálogo ativo do mesmo tenant, normaliza cliente/WhatsApp e copia os snapshots diretamente do banco.

O appointment principal continua sendo criado pela RPC legada `create_public_appointment`, sem alteração de signature ou comportamento. Um contexto local de transação, validado por trigger, liga esse insert ao novo `reservation_id`. Assim, duração, Grupo principal/secundário, horários, bloqueios e exclusion constraint existentes permanecem sob a autoridade do motor atual, sem uma segunda implementação paralela.

Locks são adquiridos em ordem determinística: primeiro `business_id + date`, depois `option_id + date` do complemento. A criação complementar ainda revalida `resource_allocations`, e a exclusion constraint é a barreira final. Conflitos são traduzidos para `reservation_primary_conflict` ou `reservation_complementary_conflict` (`23P01`). Se qualquer componente falhar, PostgreSQL reverte reservation, appointment, reservation resource, allocation e efeitos transacionais associados, sem estado parcial.

A exceção administrativa fora de `business_hours` não faz parte dessas RPCs públicas. A superfície Admin usa RPCs separadas e ignora somente a validação de funcionamento, nunca tenant, conflicts, allocations, blocks ou constraints.

Bloqueios complementares são criados por `create_admin_resource_blocks` para uma ou várias opções do Grupo complementar. O modo `day` não armazena horários fictícios; `time_slot` exige um intervalo próprio. Séries semanais permanentes são materializadas em horizonte controlado e séries limitadas respeitam a quantidade total. `materialize_resource_blocks` é idempotente, enquanto `cancel_admin_resource_block` remove somente uma ocorrência ou esta e as próximas. Todas as mutações exigem `owner`/`admin`; acesso direto de escrita permanece revogado.

Cada bloqueio ativo gera exatamente uma allocation cuja origem é exclusiva: `reservation_resource_id` para reserva ou `resource_block_id` para bloqueio. A exclusion constraint já existente continua sendo a autoridade final para conflito entre reserva × reserva, reserva × bloqueio e bloqueio × bloqueio. Ao cancelar, a allocation é desativada atomicamente e o recurso volta à disponibilidade.

Reservas públicas exclusivamente complementares geram a mesma notificação administrativa por um trigger de `reservation_resources`, vinculada por `admin_notifications.reservation_resource_id`. O trigger ignora agregados que possuem appointment; por isso reservas principais e combinadas continuam gerando exatamente uma notificação pelo caminho legado. A Server Action pública mantém o mesmo dispatcher de Web Push após o commit, e falhas desse efeito secundário nunca revertem a reserva.

O cancelamento operacional é explícito e preserva histórico. `cancel_admin_reservation_resource` cancela somente o componente complementar e o trigger existente desativa exclusivamente sua allocation. `cancel_admin_reservation` cancela appointments e componentes do agregado na mesma transação. Não existe status duplicado em `reservations`: o estado agregado continua derivado dos componentes. Ambas as RPCs são idempotentes, resolvem autorização pelo tenant do recurso e exigem owner/admin.

## Agenda administrativa

Membros autenticados consultam appointments do próprio negócio através de repositories server-only e RLS. Dashboard e Agenda não recebem `business_id` do browser. Os detalhes exibem cliente, WhatsApp, duração, grupos, status e origem, sem mostrar identificadores técnicos.

`create_admin_appointment(...)` resolve a membership `owner`/`admin`, define um contexto transacional de origem e chama `create_public_appointment`. O trigger de insert registra `source = admin` e `created_by = auth.uid()`; fora desse contexto, a origem é `public` e `created_by` permanece nulo.

`create_admin_reservation(payload)` cria reservas somente do Grupo principal, somente do Grupo complementar ou combinadas. A RPC exige `owner`/`admin`, valida o catálogo ativo do negócio atual e reutiliza `create_admin_appointment` para o componente principal. O Admin pode criar `day` em dia fechado e `time_slot` fora das janelas públicas, mas os advisory locks, allocations, bloqueios e exclusion constraints continuam ativos; qualquer conflito reverte o agregado inteiro.

`get_admin_complementary_availability(date, start_time, end_time)` retorna somente opções complementares ativas do negócio atual. A Agenda mantém reservas `day` em “Reservas do dia”, fora da grade horária, mostra reservas `time_slot` avulsas separadamente e anexa o snapshot complementar aos appointments combinados. Snapshots mantêm o histórico legível após renomear ou inativar uma opção. Negócios sem Grupo complementar preservam o modal e a Agenda legados.

Reservas exclusivamente complementares ainda não geram notificações administrativas e o cancelamento isolado do complemento permanece para uma evolução posterior. Reservas combinadas continuam notificando pelo appointment principal existente.

Na Data API, `authenticated` possui somente `SELECT` em `appointments`, ainda limitado pela RLS ao negócio do membro. Os privilégios diretos de `INSERT`, `UPDATE` e `DELETE` são revogados. Assim, a criação não contorna o motor compartilhado, a alteração de estado só ocorre por `set_appointment_status` e não há exclusão física de reservas no MVP. As RPCs são `security definer`, têm `search_path` fixo e continuam operando com os privilégios de seu proprietário, não com os grants do chamador.

`set_appointment_status(id, status)` também resolve autorização no banco e aceita somente:

- `scheduled → completed`;
- `scheduled → cancelled`;
- `scheduled → no_show`.

Um trigger aplica a mesma regra inclusive para updates diretos autorizados. `source`, `created_by` e `business_id` são imutáveis. Cancelar remove o intervalo da constraint parcial e devolve o horário ao motor público.

## Notificações administrativas e Web Push

`admin_notifications` mantém histórico por destinatário: cada insert de appointment com `source = public` dispara uma linha para cada membership `owner`/`admin` do mesmo `business_id`. A constraint `(appointment_id, user_id, type)` torna o efeito idempotente. O texto é montado no banco com nome do cliente, nomes das opções e data/horário em `America/Sao_Paulo`; labels dos grupos não são usados. Appointments administrativos e ocorrências materializadas usam `source = admin` e não disparam o trigger.

O grant autenticado é somente de leitura e a policy exige simultaneamente `user_id = auth.uid()` e membership administrativa no negócio. `mark_admin_notification_read` e `mark_all_admin_notifications_read` são as únicas mutações oferecidas ao usuário. A tabela integra a publication `supabase_realtime`, usa `REPLICA IDENTITY FULL` e o browser ainda recebe apenas linhas autorizadas pela sessão/RLS com filtro adicional pelo próprio `user_id`. O cliente trata os quatro estados do channel e, ao voltar a `SUBSCRIBED` depois de erro, timeout ou fechamento, reconcilia o feed uma vez para cobrir a janela desconectada.

`push_subscriptions` guarda endpoint e chaves Push API por usuário/negócio. O endpoint é globalmente único. `save_push_subscription` impede takeover de endpoint por outro usuário ou tenant, enquanto `remove_push_subscription` só remove subscriptions do chamador. Nenhuma chave VAPID privada ou service role chega ao browser.

O dispatcher server-side possui somente `SELECT` e `DELETE` diretos em `push_subscriptions`: leitura para resolver os dispositivos do destinatário e remoção de endpoints definitivamente expirados. Em `admin_notification_push_deliveries`, o grant direto é somente `SELECT`; inserts continuam exclusivamente pela RPC `record_admin_push_delivery`. Nenhum privilégio adicional é concedido a `anon`, `authenticated` ou `public`.

O despacho ocorre depois que a RPC de booking conclui. `claim_pending_admin_push_notifications` é executável somente por `service_role` e cria um lease de cinco minutos com token, usando `FOR UPDATE SKIP LOCKED`; não altera `push_dispatched_at`. Claims ativos impedem processamento concorrente e claims expirados voltam a ser elegíveis.

Cada sucesso por dispositivo é registrado em `admin_notification_push_deliveries`. Ao tentar novamente, o dispatcher pula subscriptions já entregues e processa apenas as restantes. Depois de concluir todas as subscriptions ainda válidas, `complete_admin_push_notification` preenche `push_dispatched_at`. Falha transitória chama `release_admin_push_notification`, mantendo o item pendente; endpoints definitivos `404`/`410` são removidos sem impedir os demais dispositivos. Se o destinatário não possui subscription, a conclusão usa `no_subscriptions`, evitando claim preso ou loop infinito. Nenhum efeito secundário participa da transação do appointment.

Para diagnóstico operacional, o servidor informa apenas a etapa, erro sanitizado, `statusCode`, contagens de claim/subscriptions/entregas e booleanos de presença das quatro variáveis necessárias. Endpoint, `p256dh`, `auth`, service role e VAPID privada nunca são registrados. Se a configuração server-side estiver incompleta, a fila permanece pendente e o booking continua confirmado.

## Lote Fundadores

O contador comercial usa uma configuração única em `private.founder_offer_config`: 50 vagas, baseline de 38 ocupadas e marco persistido em `2026-08-25 16:45:00 America/Sao_Paulo`. Negócios anteriores ao marco já fazem parte do baseline e não são recontados.

Uma vaga só é reivindicada ao final transacional de `complete_business_onboarding`. A reivindicação usa o `business_id`, não o usuário, e fica em `private.founder_offer_claims` sem exclusão em cascata; inativação, falta de acesso ou cancelamento futuro não devolvem a vaga. A chave única torna o registro idempotente. O total apresentado é `min(50, 38 + reivindicações)`, portanto disponibilidade e percentual nunca ultrapassam seus limites.

A landing não lê essas tabelas. A RPC anônima `get_public_founder_offer()` retorna somente `totalSpots`, `occupiedSpots`, `availableSpots` e `occupiedPercentage`. O Server Component consulta essa superfície com a chave pública, revalida em 60 segundos e usa 38/12/76 como fallback se a leitura falhar; nenhuma service role ou informação identificável de negócio é enviada ao visitante.

## Migrations e tipos

As migrations são aplicadas em ordem:

1. `20260818020000_initial_multitenant_schema.sql` — enums, tabelas, constraints, triggers e helpers;
2. `20260818020100_rls_and_public_booking_api.sql` — grants, policies e RPC pública.
3. `20260818030000_business_onboarding_and_logos.sql` — onboarding transacional e bucket seguro de logos.
4. `20260818040000_booking_engine.sql` — disponibilidade pública, criação atômica e proteção contra sobreposição.
5. `20260818050000_admin_appointments.sql` — origem, criação manual compartilhada e transições administrativas.
6. `20260818051000_restrict_appointment_mutations.sql` — mantém leitura via RLS e revoga mutações diretas em appointments.
7. `20260818060000_super_admin.sql` — RPCs globais controladas, auditoria de status e privilégios de ativação.
8. `20260818070000_mvp_visual_polish.sql` — contatos públicos opcionais, tema binário padrão e atualização curada das RPCs de onboarding/página pública.
9. `20260818080000_appointment_whatsapp_reminders.sql` — registro controlado do último lembrete administrativo.
10. `20260818090000_recurring_appointment_schema.sql` — séries semanais, vínculo das ocorrências, índices, triggers e RLS.
11. `20260818091000_recurring_appointment_rpcs.sql` — criação, materialização idempotente e cancelamento transacional das séries.
12. `20260818100000_multiple_business_hours.sql` — múltiplas janelas normalizadas, proteção contra sobreposição e motor/onboarding atualizados.
13. `20260822010000_admin_booking_notifications.sql` — notificações por destinatário, Realtime, subscriptions Web Push, RPCs de leitura/registro e fila server-only.
14. `20260822020000_reliable_admin_push_claims.sql` — leases temporários, confirmação pós-envio e ledger de entrega por dispositivo.
15. `20260822150000_minimal_service_role_push_grants.sql` — grants mínimos do dispatcher server-side nas tabelas de subscriptions e entregas.
16. `20260826010000_complementary_group_catalog.sql` — posição 3, modo de ocupação e nome curto configurável do Grupo complementar.
17. `20260826020000_reservation_allocation_engine.sql` — agregado de reservas, componentes complementares, allocations e proteção GiST de concorrência.
18. `20260826030000_complementary_group_onboarding.sql` — onboarding atômico opcional do Grupo complementar, preservando payloads legados e o claim Fundadores.
19. `20260826040000_complementary_availability_and_reservations.sql` — disponibilidade pública curada e criação agregada transacional com reutilização do motor legado.
20. `20260826050000_fix_complementary_rpc_trim.sql` — corrige a resolução explícita da normalização textual nas RPCs complementares.
21. `20260826060000_fix_primary_only_reservation_response.sql` — preserva a resposta do agregado quando a reserva contém somente o Grupo principal.
22. `20260827010000_public_complementary_group_metadata.sql` — adiciona somente `intent_name` e `occupancy_mode` do Grupo complementar ao payload público curado.
23. `20260827020000_admin_complementary_reservations.sql` — disponibilidade e criação administrativa transacional para reservas principais, complementares e combinadas.
24. `20260827020100_fix_admin_reservation_trim.sql` — corrige a normalização textual e endurece a validação do payload da RPC administrativa.

O seed cria o catálogo “Arena Central / Quadra / Esporte”, mas nenhum usuário ou credencial. Os tipos em `src/types/database.ts` devem ser regenerados após mudanças remotas com:

```bash
npx supabase gen types typescript --linked > src/types/database.ts
```

Revise o diff gerado antes do commit.

## Onboarding e telas conectadas

Um usuário autenticado sem memberships é enviado de `/admin` para `/onboarding`. Quem já pertence a um negócio é enviado do onboarding para o painel, inclusive quando o negócio está inativo, evitando loops de redirect.

Ao concluir, `public.complete_business_onboarding(jsonb)` valida que este é o primeiro negócio do usuário e executa uma única transação. A função usa `create_business_with_owner` e persiste nome, contatos públicos opcionais, estados e opções ordenadas dos Grupos 1 e 2, todas as janelas dos sete dias em `business_hours`, modo de duração, paleta e preferência de tema.

O slug é derivado automaticamente do nome completo e exibido apenas como preview. Em conflito, a Server Action tenta sufixos numéricos simples (`nome-2`, `nome-3` etc.); a constraint única do banco continua sendo a garantia final e nenhum campo editável de slug é exigido no onboarding.

As telas Meu negócio, Configuração da agenda, Horários e Aparência carregam dados em Server Components e salvam por Server Actions autenticadas. Em Horários, ativar um dia, adicionar/remover períodos e repetir um dia nos destinos selecionados operam sobre a lista completa de janelas; remover a última janela fecha o dia. Cada mutation resolve o negócio pela sessão; o browser não escolhe livremente um `business_id`, e RLS permanece a barreira final de autorização.

`business_settings.theme_preference` conserva o enum legado no schema por compatibilidade, mas a aplicação oferece somente `light` e `dark`. A migration converte registros `system` para `light`, altera o default e as leituras defensivas também normalizam qualquer valor legado para claro. O seletor é exclusivamente por ícone.

## Intervalos que atravessam a meia-noite

### Edição e seleção de horários

O editor semanal compartilhado de Horários e das opções do Grupo principal permite repetir qualquer dia em destinos escolhidos. Copia todas as janelas por valor; copiar um dia fechado envia destinos sem janelas. Sobrescrever horários diferentes exige confirmação explícita e a persistência continua dependendo de “Salvar horários”, pelas RPCs existentes.

A página pública organiza os slots do principal em linhas de 44px, agrupadas por hora. O componente apenas apresenta os slots recebidos, sem gerar disponibilidade ou alterar duração/blocos consecutivos. O visual do fluxo exclusivamente complementar permanece inalterado.

Regressão explícita: com duração 60, custom `18:15–00:15` retorna `18:15` até `23:15`; custom `18:15–00:00` retorna apenas até `22:15`. O suporte do motor pertence à migration abaixo, já aplicada na PR #50; a evolução da interface não exige nova migration.

### Representação temporal

A migration `20260901020000_cross_midnight_booking_hours.sql` mantém as colunas de data e horário existentes. A data é sempre a **data civil do início**; `end_time < start_time` significa término no dia seguinte. Horários iguais continuam inválidos. O fechamento `00:00` continua sendo normalizado para `24:00` quando apropriado: `23:15–00:00` encerra na fronteira do dia, enquanto `23:15–00:15` ocupa também os primeiros quinze minutos do dia seguinte. Não há conversão desses horários locais para UTC.

`private.booking_period` centraliza o intervalo temporal semiaberto `[início, fim)`. Appointments, bloqueios e allocations usam esse período para detectar sobreposição entre datas diferentes; intervalos adjacentes continuam permitidos. A exclusão dos appointments mantém o Grupo principal como recurso. Um lock transacional por negócio/recurso coordena os guards de appointments e calendar blocks, inclusive quando as datas de início diferem. As exclusões de horários semanais usam `private.weekly_booking_period`, incluindo a virada de sábado para domingo.

`private.effective_primary_periods` resolve janelas da data consultada e da véspera, preservando a precedência `business`/`custom` e a âncora original. Cada resposta de disponibilidade contém somente inícios na data civil solicitada. Assim, segunda `23:15–02:15`, com duração de 60 minutos, oferece segunda `23:15` e terça `00:15`, `01:15`. O fim completo precisa caber na janela. Blocos consecutivos podem atravessar a meia-noite; a página pública identifica explicitamente a extensão para o dia seguinte, sem confundi-la com um horário da madrugada da mesma data.

O Admin mantém sua exceção de funcionamento, mas não ignora conflitos, bloqueios, tenant ou constraints. Edição e recorrência reutilizam o motor existente. A Agenda diária inclui a parcela de reservas/bloqueios iniciados na véspera; essa projeção é somente visual e não modifica a data usada pelas ações.

Complementares `time_slot`, inclusive reservas combinadas e bloqueios, seguem a mesma semântica temporal e as allocations existentes. Complementares `day` continuam ocupando um único dia civil, sem horário fictício; publicamente exigem funcionamento ativo nesse dia, não apenas uma janela herdada da véspera. Não foram ampliados grants públicos nem alteradas as policies RLS.

## Storage de logos

O bucket `business-logos` é público porque o logo aparece na página anônima, mas aceita somente PNG, JPEG e WebP de até 2 MB. A URL pública serve a imagem, sem liberar listagem anônima dos metadados de `storage.objects`.

Uploads usam o caminho `<business_id>/logo`. As policies permitem SELECT/INSERT/UPDATE/DELETE somente a `owner` ou `admin` do negócio indicado nesse prefixo, além do Super Admin. O upload usa a sessão autenticada e nunca uma service-role key no browser.

## Mocks restantes

Somente o preview de Aparência usa conteúdo fictício para permitir edição sem criar reservas. Dashboard, Agenda, disponibilidade e criação de appointments usam dados reais.

Planos comerciais, cobrança, trial, limites por plano, impersonação, exclusão definitiva de negócios, logs completos e relatórios avançados permanecem fora do MVP.

### Séries semanais e materialização

`create_recurring_appointment_series(...)` cria a série e materializa suas ocorrências na mesma transação. Antes dos inserts, todas as datas ausentes são verificadas por `get_booking_availability`; cada insert efetivo é delegado a `create_public_appointment`. Assim, as regras do motor e a exclusion constraint continuam sendo as autoridades finais, e uma falha reverte série e ocorrências em conjunto.

Para séries permanentes, `materialize_recurring_appointments(series_id, horizon_date)` limita qualquer horizonte solicitado a hoje + 90 dias. Para séries limitadas, nunca passa da data da ocorrência `repeat_count`. O índice único `(series_id, appointment_date)` torna a operação idempotente. A existência de qualquer appointment da série naquela data — inclusive cancelado — impede recriação; séries inativas são no-op.

`cancel_recurring_appointment(id, 'single')` cancela somente uma ocorrência. Com `'future'`, bloqueia a série, cancela atomicamente a ocorrência selecionada e as posteriores ainda `scheduled`, e marca `active = false`. `set_appointment_status` continua sendo usado para `completed` e `no_show`, logo esses estados nunca afetam outras ocorrências nem a série.

As tabelas continuam sem mutação direta para `authenticated`. Membros consultam séries do próprio negócio por RLS, enquanto criação, materialização e cancelamento passam por RPCs `security definer`, com `search_path` fixo e autorização `owner`/`admin`. O consumidor anônimo não recebe grants sobre séries nem acesso a essas RPCs.
