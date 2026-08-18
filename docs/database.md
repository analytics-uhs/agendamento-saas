# Fundação Supabase

## Modelo e relacionamentos

`profiles` estende `auth.users` em uma relação 1:1 e não duplica e-mail. O trigger `on_auth_user_created` cria o perfil automaticamente.

`businesses` representa o estabelecimento. `business_members` é a relação N:N entre usuários e empresas e começa com os papéis `owner` e `admin`; não existe a premissa de um único usuário por negócio.

Todos os registros de negócio carregam ou derivam `business_id`:

- `booking_groups`: exatamente posições 1 ou 2, com nome e estado configuráveis;
- `booking_options`: opções genéricas ligadas ao grupo; `duration_minutes` serve ao modo `group_2`;
- `business_hours`: sete dias, de 0 (domingo) a 6 (sábado);
- `business_settings`: duração, paleta e preferência de tema;
- `appointments`: reservas públicas ou administrativas; `source` registra `public`/`admin`, e os estados não cancelados bloqueiam disponibilidade.

Foreign keys compostas impedem que opções de outra empresa sejam referenciadas. Um trigger também valida que `group_1_option_id` e `group_2_option_id` apontem para as posições lógicas corretas. Outro trigger impede remover ou rebaixar o último owner.

## Multiempresa e RLS

Todas as tabelas expostas têm RLS habilitado. Funções auxiliares em `private` consultam membership sem recursão de policies e usam `security definer` com `search_path` fixo:

- `private.is_business_member(business_id)`;
- `private.has_business_role(business_id, roles[])`;
- `private.is_platform_admin()`.

Um usuário autenticado lê e altera somente o próprio profile. Membros leem o negócio e seus dados. `owner` e `admin` gerenciam configurações, opções, horários e appointments; somente `owner` gerencia memberships. Toda operação continua limitada ao `business_id` autorizado. O frontend nunca escolhe livremente um `business_id`: pages e Server Actions resolvem a primeira membership da sessão.

`public.create_business_with_owner` é a primitiva atômica de onboarding: cria negócio, owner, dois grupos, sete dias de horários e settings padrão. Inserção direta em `businesses` não é concedida ao cliente autenticado.

## Super Admin

Super Admin não é uma coluna editável pelo cliente. A allow-list `private.platform_admins` fica fora dos schemas expostos pela Data API, sem grants para `anon` ou `authenticated` e com RLS habilitado. Somente operações privilegiadas de plataforma (SQL administrativo ou backend confiável futuro) podem provisioná-la. As policies consultam a allow-list pela função privada `is_platform_admin()`.

Para provisionar futuramente, use uma operação administrativa auditada, nunca o client browser:

```sql
insert into private.platform_admins (user_id, created_by)
values ('<auth-user-id>', '<admin-actor-id>');
```

## Página pública e motor de reservas

`anon` não possui privileges diretos sobre as tabelas administrativas nem sobre `appointments`. A superfície pública é limitada a três RPCs `security definer`, todas com `search_path` fixo:

- `get_public_booking_page(slug)`: retorna a configuração curada necessária para renderizar a página;
- `get_booking_availability(slug, date, group_1_option_id, group_2_option_id)`: retorna somente início, duração base e quantidade de blocos consecutivos;
- `create_public_appointment(...)`: revalida todos os dados e cria a reserva atomicamente, retornando somente uma confirmação sanitizada.

A configuração pública contém apenas:

- nome, slug, WhatsApp e logo de um negócio ativo;
- grupos e opções ativos;
- horários ativos;
- settings indispensáveis para renderização e duração.

Profiles, memberships, appointments existentes e dados de outros clientes nunca são retornados. Os IDs públicos de negócio e opções são usados apenas como referências opacas e são revalidados contra o slug e o estado ativo no banco.

### Disponibilidade e duração

Os horários começam na abertura e avançam pela duração base. Dias fechados, datas passadas, horários já iniciados no dia atual e intervalos que ultrapassam o fechamento não são oferecidos. Appointments `scheduled`, `completed` e `no_show` bloqueiam; `cancelled` não bloqueia.

- `fixed`: exatamente um bloco de `fixed_duration_minutes`;
- `fixed_multiple`: a RPC informa quantos blocos livres e consecutivos cabem em cada início;
- `group_2`: usa `duration_minutes` da opção ativa do Grupo 2 e aceita exatamente um bloco.

### Modelo de recurso

No MVP, a opção selecionada do Grupo 1 é a identidade do recurso independente da agenda:

- `Grupo 1 = Quadra`: cada quadra pode receber uma reserva simultânea;
- `Grupo 1 = Profissional`: cada profissional possui disponibilidade independente;
- Grupo 1 inativo: o estabelecimento inteiro é um único recurso.

Consequentemente, opções diferentes do Grupo 1 podem ter appointments no mesmo intervalo, enquanto appointments da mesma opção não podem se sobrepor. Sem Grupo 1 ativo, dois appointments do negócio no mesmo intervalo entram em conflito. O Grupo 2 classifica a reserva e pode definir sua duração, mas nunca altera o escopo de concorrência.

Essa regra é uma decisão estrutural do motor, não uma inferência baseada no nome configurado para o grupo. Internamente, a chave do recurso é `group_1_option_id` quando aplicável e `business_id` quando não há Grupo 1 ativo.

O MVP usa `America/Sao_Paulo` para definir “agora”; uma configuração de fuso por estabelecimento deve preceder expansão internacional.

### Concorrência e atomicidade

Antes do insert, `create_public_appointment` obtém um advisory transaction lock por negócio/data e repete toda a validação de conflito. A constraint GiST `appointments_no_overlapping_active_bookings` é uma segunda barreira no banco para intervalos sobrepostos do mesmo recurso. Intervalos usam limites `[início, fim)`, portanto `09:00–09:30` e `09:30–10:00` são adjacentes e válidos.

Duas requisições para o mesmo slot são serializadas; a segunda recebe `booking_conflict` (`23P01`). A Server Action converte isso em mensagem amigável e recarrega a disponibilidade. O cliente nunca recebe mensagens internas do PostgreSQL.

## Agenda administrativa

Membros autenticados consultam appointments do próprio negócio através de repositories server-only e RLS. Dashboard e Agenda não recebem `business_id` do browser. Os detalhes exibem cliente, WhatsApp, duração, grupos, status e origem, sem mostrar identificadores técnicos.

`create_admin_appointment(...)` resolve a membership `owner`/`admin`, define um contexto transacional de origem e chama `create_public_appointment`. O trigger de insert registra `source = admin` e `created_by = auth.uid()`; fora desse contexto, a origem é `public` e `created_by` permanece nulo.

Na Data API, `authenticated` possui somente `SELECT` em `appointments`, ainda limitado pela RLS ao negócio do membro. Os privilégios diretos de `INSERT`, `UPDATE` e `DELETE` são revogados. Assim, a criação não contorna o motor compartilhado, a alteração de estado só ocorre por `set_appointment_status` e não há exclusão física de reservas no MVP. As RPCs são `security definer`, têm `search_path` fixo e continuam operando com os privilégios de seu proprietário, não com os grants do chamador.

`set_appointment_status(id, status)` também resolve autorização no banco e aceita somente:

- `scheduled → completed`;
- `scheduled → cancelled`;
- `scheduled → no_show`.

Um trigger aplica a mesma regra inclusive para updates diretos autorizados. `source`, `created_by` e `business_id` são imutáveis. Cancelar remove o intervalo da constraint parcial e devolve o horário ao motor público.

## Migrations e tipos

As migrations são aplicadas em ordem:

1. `20260818020000_initial_multitenant_schema.sql` — enums, tabelas, constraints, triggers e helpers;
2. `20260818020100_rls_and_public_booking_api.sql` — grants, policies e RPC pública.
3. `20260818030000_business_onboarding_and_logos.sql` — onboarding transacional e bucket seguro de logos.
4. `20260818040000_booking_engine.sql` — disponibilidade pública, criação atômica e proteção contra sobreposição.
5. `20260818050000_admin_appointments.sql` — origem, criação manual compartilhada e transições administrativas.
6. `20260818051000_restrict_appointment_mutations.sql` — mantém leitura via RLS e revoga mutações diretas em appointments.

O seed cria o catálogo “Arena Central / Quadra / Esporte”, mas nenhum usuário ou credencial. Os tipos em `src/types/database.ts` devem ser regenerados após mudanças remotas com:

```bash
npx supabase gen types typescript --linked > src/types/database.ts
```

Revise o diff gerado antes do commit.

## Onboarding e telas conectadas

Um usuário autenticado sem memberships é enviado de `/admin` para `/onboarding`. Quem já pertence a um negócio é enviado do onboarding para o painel, inclusive quando o negócio está inativo, evitando loops de redirect.

Ao concluir, `public.complete_business_onboarding(jsonb)` valida que este é o primeiro negócio do usuário e executa uma única transação. A função usa `create_business_with_owner` e persiste nomes, estados e opções ordenadas dos Grupos 1 e 2, os sete dias de `business_hours`, modo de duração, paleta e preferência de tema.

O slug é normalizado e validado na aplicação, mas a constraint única do banco continua sendo a garantia final. Conflitos PostgreSQL `23505` são convertidos em uma mensagem amigável.

As telas Meu negócio, Configuração da agenda, Horários e Aparência carregam dados em Server Components e salvam por Server Actions autenticadas. Cada mutation resolve o negócio pela sessão; o browser não escolhe livremente um `business_id`, e RLS permanece a barreira final de autorização.

## Storage de logos

O bucket `business-logos` é público porque o logo aparece na página anônima, mas aceita somente PNG, JPEG e WebP de até 2 MB. A URL pública serve a imagem, sem liberar listagem anônima dos metadados de `storage.objects`.

Uploads usam o caminho `<business_id>/logo`. As policies permitem SELECT/INSERT/UPDATE/DELETE somente a `owner` ou `admin` do negócio indicado nesse prefixo, além do Super Admin. O upload usa a sessão autenticada e nunca uma service-role key no browser.

## Mocks restantes

Somente o preview de Aparência usa conteúdo fictício para permitir edição sem criar reservas. Dashboard, Agenda, disponibilidade e criação de appointments usam dados reais.
