# Fundação Supabase

## Modelo e relacionamentos

`profiles` estende `auth.users` em uma relação 1:1 e não duplica e-mail. O trigger `on_auth_user_created` cria o perfil automaticamente.

`businesses` representa o estabelecimento. `business_members` é a relação N:N entre usuários e empresas e começa com os papéis `owner` e `admin`; não existe a premissa de um único usuário por negócio.

Todos os registros de negócio carregam ou derivam `business_id`:

- `booking_groups`: exatamente posições 1 ou 2, com nome e estado configuráveis;
- `booking_options`: opções genéricas ligadas ao grupo; `duration_minutes` serve ao modo `group_2`;
- `business_hours`: sete dias, de 0 (domingo) a 6 (sábado);
- `business_settings`: duração, paleta e preferência de tema;
- `appointments`: estrutura inicial, sem motor de disponibilidade nesta fase.

Foreign keys compostas impedem que opções de outra empresa sejam referenciadas. Um trigger também valida que `group_1_option_id` e `group_2_option_id` apontem para as posições lógicas corretas. Outro trigger impede remover ou rebaixar o último owner.

## Multiempresa e RLS

Todas as tabelas expostas têm RLS habilitado. Funções auxiliares em `private` consultam membership sem recursão de policies e usam `security definer` com `search_path` fixo:

- `private.is_business_member(business_id)`;
- `private.has_business_role(business_id, roles[])`;
- `private.is_platform_admin()`.

Um usuário autenticado lê e altera somente o próprio profile. Membros leem o negócio e seus dados. `owner` e `admin` gerenciam configurações, opções, horários e appointments; somente `owner` gerencia memberships. Toda operação continua limitada ao `business_id` autorizado.

`public.create_business_with_owner` é a primitiva atômica de onboarding: cria negócio, owner, dois grupos, sete dias de horários e settings padrão. Inserção direta em `businesses` não é concedida ao cliente autenticado.

## Super Admin

Super Admin não é uma coluna editável pelo cliente. A allow-list `private.platform_admins` fica fora dos schemas expostos pela Data API, sem grants para `anon` ou `authenticated` e com RLS habilitado. Somente operações privilegiadas de plataforma (SQL administrativo ou backend confiável futuro) podem provisioná-la. As policies consultam a allow-list pela função privada `is_platform_admin()`.

Para provisionar futuramente, use uma operação administrativa auditada, nunca o client browser:

```sql
insert into private.platform_admins (user_id, created_by)
values ('<auth-user-id>', '<admin-actor-id>');
```

## Página pública

`anon` não possui privileges diretos sobre as tabelas administrativas. A única leitura pública é `public.get_public_booking_page(slug)`, uma RPC `security definer` que retorna apenas:

- nome, slug, WhatsApp e logo de um negócio ativo;
- grupos e opções ativos;
- horários ativos;
- settings indispensáveis para renderização e duração.

Profiles, memberships, appointments, clientes e identificadores internos do negócio não são retornados. A criação pública de appointments exigirá uma RPC separada, transacional e validada quando o motor de disponibilidade for implementado.

## Migrations e tipos

As migrations são aplicadas em ordem:

1. `20260818020000_initial_multitenant_schema.sql` — enums, tabelas, constraints, triggers e helpers;
2. `20260818020100_rls_and_public_booking_api.sql` — grants, policies e RPC pública.
3. `20260818030000_business_onboarding_and_logos.sql` — onboarding transacional e bucket seguro de logos.

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

Dashboard, Agenda, appointments, cálculo de disponibilidade e envio do agendamento público continuam mockados. O preview de Aparência ainda usa conteúdo fictício de agendamento, aplicando a paleta persistida.
