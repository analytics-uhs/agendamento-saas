# Módulos por negócio

## Fundação implementada

`business_modules` separa habilitação de módulos das configurações operacionais
de `business_settings`. Um módulo é uma capacidade comercial por tenant; uma
feature é uma funcionalidade dentro dele. Não é um sistema genérico de plugins.

| Chave | Nome futuro | Default | Conteúdo |
| --- | --- | --- | --- |
| `scheduling` | Agenda | ativo | Núcleo atual, sem mudanças no motor |
| `management` | Gestão | inativo | Futuramente Produtos, Estoque, Compras, Vendas e Financeiro |
| `fiscal` | Fiscal | inativo | Futuramente NFC-e, Configuração fiscal e Documentos fiscais |

Gestão e Fiscal ainda não têm páginas nem operações. Fiscal poderá depender
comercialmente de Gestão; esta PR não cria dependência técnica entre eles.

## Persistência e onboarding

Migration `20260903020000_business_modules_foundation.sql`: chave primária
`(business_id, module)`, FK com cascade, check dos três nomes, `enabled NOT NULL`
e timestamps com o trigger compartilhado de atualização. A PK também atende à
consulta por tenant; não há índice redundante.

O backfill insere os três defaults em todos os negócios existentes. Um trigger
`AFTER INSERT` em `businesses` insere os mesmos defaults para negócios novos,
inclusive onboarding legado/complementar e provisionamento privilegiado.
Ambos usam `ON CONFLICT DO NOTHING`, sem sobrescrever estados existentes.
O trigger participa da transação original: falhas posteriores revertem negócio,
módulos e demais efeitos do onboarding. Não foram copiadas nem alteradas RPCs.

## Segurança e ativação futura

RLS usa `private.is_business_member`; authenticated possui somente SELECT dos
próprios negócios. Não há grants para anon/service_role nem mutações para
owner/admin. Não há política de escrita, RPC ou Server Action de ativação.
O trigger privado usa `security definer`, `search_path = ''` e execução revogada
dos papéis de cliente. Grants existentes de outras tabelas permanecem iguais.

Nesta etapa apenas um operador SQL privilegiado pode modificar a configuração;
nenhuma ativação é feita por esta PR. Uma futura operação do Super Admin deverá
validar `private.is_platform_admin()` e auditar ator/alteração no servidor. A
allow-list existente não dá acesso direto a esta tabela sem membership, nem
permite escrita. A interface atual do Super Admin permanece inalterada.

## Aplicação, navegação e rotas futuras

`src/lib/business-modules.ts` define nomes, tipos, parser, verificação e filtro.
O repository server-only `getBusinessModules(businessId)` usa a sessão Supabase,
não service role. O layout Admin resolve o tenant pela membership já existente
e faz uma única leitura dos três estados, compartilhados por desktop/mobile.
Erros de leitura não habilitam módulos; configurações ausentes falham fechadas.

`admin-navigation-items.ts` centraliza os itens com `requiredModule` opcional.
Início/Agenda/Configuração/Horários declaram `scheduling`; Aparência/Meu negócio
continuam gerais. Os defaults preservam todos os itens, ícones, ordem e classes.
Nenhum link de Gestão/Fiscal foi adicionado.

Páginas futuras devem executar, **antes de ler seus dados**:

```ts
const business = await requireBusinessModule("management");
```

O guard server-only deriva o tenant via `requireCurrentBusiness()` e usa
`notFound()` quando o módulo está inativo. Autenticação e ausência de negócio
mantêm os redirects existentes. Mutations futuras também precisarão dessa
verificação e de autorização/integridade no banco; esconder menu não autoriza
uma operação. Rotas/RPCs atuais de Agenda não foram bloqueadas nem alteradas.

## Limites

Sem cobrança, planos, trial, produtos, estoque, caixa, notas fiscais, novas
telas ou alteração de booking/notifications/Founder. A migração deve preceder
o deploy da aplicação, pois o layout passa a ler `business_modules`.
