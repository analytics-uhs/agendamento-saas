# Módulos por negócio

## Fundação implementada

`business_modules` separa habilitação de módulos das configurações operacionais
de `business_settings`. Um módulo é uma capacidade comercial por tenant; uma
feature é uma funcionalidade dentro dele. Não é um sistema genérico de plugins.

| Chave | Nome futuro | Default | Conteúdo |
| --- | --- | --- | --- |
| `scheduling` | Agenda | ativo | Núcleo atual, sem mudanças no motor |
| `management` | Gestão | inativo | Produtos, Estoque, Compras, Vendas e Financeiro |
| `fiscal` | Fiscal | inativo | Preparação local e leitura de documentos NFC-e; emissão futura |

Fiscal possui `/admin/fiscal` e preparação opcional a partir de vendas completed.
Usa seu próprio guard/RLS, sem depender tecnicamente de `management`; o detalhe
comercial da venda continua na Gestão. Nenhum módulo é ativado automaticamente.
Veja [Fundação fiscal](architecture-fiscal.md).

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

## Segurança e gestão pelo Super Admin

RLS usa `private.is_business_member`; authenticated possui somente SELECT dos
próprios negócios. Não há grants para anon/service_role nem mutações para
owner/admin. Não há política de escrita nem UPDATE direto pelo browser.
O trigger privado usa `security definer`, `search_path = ''` e execução revogada
dos papéis de cliente. Grants existentes de outras tabelas permanecem iguais.

A migration `20260906030000_super_admin_business_modules.sql` acrescenta
`updated_by` (último ator; não é histórico completo) e duas RPCs com
`search_path = ''`: `get_platform_business_modules` e
`set_platform_business_module_enabled`. Ambas exigem `auth.uid()` e a autoridade
existente `private.is_platform_admin()`. EXECUTE somente para authenticated;
owner/admin comum continua bloqueado pela validação. RLS de leitura não muda.

O detalhe `/super-admin/negocios/[businessId]` contém a seção Módulos. Repository
server-only verifica `requirePlatformAdmin()` e usa a sessão autenticada, sem
service role. A Server Action revalida o detalhe e o layout Admin. A RPC valida
negócio/módulo/booleano, faz UPSERT pela PK e registra ator/timestamp. Somente a
linha do módulo solicitado muda: desativar não apaga, arquiva nem altera os dados
de Gestão/Fiscal. Os módulos permanecem independentes.

Agenda ativa fica não editável: `/admin` e RPCs atuais ainda assumem o núcleo de
agendamento, portanto não seria seguro apenas ocultar o menu. A RPC também
rejeita `scheduling=false`. Se a linha estiver ausente/inativa, a interface mostra
o estado real e permite restaurar Agenda via UPSERT; não fabrica um estado ativo.
Outras linhas ausentes são interpretadas como inativas, preservando fail-closed.

## Aplicação, navegação e rotas futuras

`src/lib/business-modules.ts` define nomes, tipos, parser, verificação e filtro.
O repository server-only `getBusinessModules(businessId)` usa a sessão Supabase,
não service role. O layout Admin resolve o tenant pela membership já existente
e faz uma única leitura dos três estados, compartilhados por desktop/mobile.
Erros de leitura não habilitam módulos; configurações ausentes falham fechadas.

`admin-navigation-items.ts` centraliza os itens com `requiredModule` opcional.
Início/Agenda/Configuração/Horários declaram `scheduling`; Aparência/Meu negócio
continuam gerais. Os defaults preservam todos os itens, ícones, ordem e classes.
Gestão e Fiscal adicionam seus links somente quando o respectivo módulo está ativo.

Páginas futuras devem executar, **antes de ler seus dados**:

```ts
const business = await requireBusinessModule("management");
```

O guard server-only deriva o tenant via `requireCurrentBusiness()` e usa
`notFound()` quando o módulo está inativo. Autenticação e ausência de negócio
mantêm os redirects existentes. Mutations futuras também precisarão dessa
verificação e de autorização/integridade no banco; esconder menu não autoriza
uma operação. Rotas/RPCs atuais de Agenda não foram bloqueadas nem alteradas.

## Limites da gestão de módulos

Sem cobrança, planos, submódulos ou alteração das regras de booking, estoque,
vendas, financeiro ou emissão fiscal. A migration deve preceder o deploy da
seção de gestão. Ativações em negócios reais são feitas pelo operador; testes
usam fixtures sintéticas com rollback, sem ativar negócio de cliente.
