# Provisionamento assistido — PR #70

Implementação: negócio sem owner, configuração explícita pelo Platform Admin e convite secreto com aceite transacional.

## Arquitetura encontrada

| Área | Evidência no código atual | Consequência |
| --- | --- | --- |
| Negócio | `businesses` não possui owner_id nem FK obrigatória para membro | Um negócio sem owner já é estruturalmente válido |
| Membership | `business_members`, FK business/user, unique(business_id,user_id) | Schema N:N; não representa sozinho a experiência de troca de negócio |
| Último owner | `private.preserve_last_business_owner` é BEFORE UPDATE/DELETE | Impede remover/rebaixar o último owner; não impede criar negócio sem membro |
| Criação base | `create_business_with_owner` insere business, owner, grupos 1/2, horários e settings | Não pode ser chamada pelo provisionamento e depois remover owner: isso seria identidade artificial e conflitaria com o trigger |
| Onboarding | `complete_business_onboarding` reutiliza o legado e acrescenta complementar/claim Fundadores na mesma transação | Não duplicar o onboarding ou executá-lo durante aceite |
| Módulos | Trigger AFTER INSERT em businesses inicializa scheduling=true, management/fiscal=false | Reutilizar trigger; aceite não faz inicialização nem sobrescreve módulos |
| Perfil | Trigger de auth.users cria profiles; e-mail permanece no Auth | Usar signup existente, sem Admin API ou usuário fictício |
| Current business | `getCurrentBusiness` escolhe primeira membership por created_at | Aplicação não oferece seletor de negócio; não adicionar segunda membership no aceite desta PR |
| Destino Auth | `resolveUserDestination`: platform → /super-admin; membership → /admin; demais → /onboarding | Depois do aceite, membership existente dispensa onboarding |
| Signup | `/criar-conta`, `supabase.auth.signUp`, nome/e-mail/senha, trata ausência de session | Reutilizar; nova decisão prevê sessão imediata, sempre verificando session válida |
| Login | `signInWithPassword`, depois resolveUserDestination; next limitado a /admin | Introduzir retorno de convite controlado pelo servidor, não open redirect |
| Callback | `/auth/callback` troca code por sessão e resolve destino | E-mail/senha não depende do callback; Google usa PKCE e retorna ao convite |
| Proxy | Atualiza sessão; exige claims em /admin | /convite pode continuar público sem enfraquecer /admin |
| Super Admin | requirePlatformAdmin + is_current_user_platform_admin + private.is_platform_admin | Reutilizar allow-list/autorização existente, nunca role fictícia |
| Configuração | getBusinessConfiguration(businessId), quatro formulários Admin, actions centralizadas | Reutilização possível sem copiar formulários |
| RLS configuração | Businesses, groups/options, hours/settings já permitem Platform Admin | Não ampliar helpers globais de membership ou módulos |
| Horários gerais | replace_business_hours infere primeira membership; private.insert_business_hours_payload já concentra persistência/validação | Nova entrada Platform Admin explícita pode reutilizar o helper privado |
| Horário por opção | set_admin_booking_option_schedule já permite Platform Admin e resolve tenant pela opção | Repository deve também vincular opção ao business explicitamente selecionado |
| Logo | Storage business-logos usa sessão e policy can_manage_business_logo admite Platform Admin | Reutilizar uploader; persistência de URL precisa receber contexto de configuração validado |
| Público | get_public_booking_page/availability resolvem business ativo/configuração, não owner | Não exigir owner para agendar; notificações dependem dos destinatários existentes |

Arquivos principais auditados:

- `src/lib/repositories/businesses.ts`, `business-configuration.ts`, `option-schedules.ts`, `super-admin.ts`;
- `src/lib/auth/destination.ts`, `platform-admin.ts`, `business-module.ts`;
- `src/app/criar-conta/actions.ts`, `src/app/auth/actions.ts`, `src/app/auth/callback/route.ts`;
- `src/app/admin/actions.ts`, `option-schedule-actions.ts` e layout;
- páginas/components de Negócio, Horários, Configuração, Aparência e Super Admin;
- migrations inicial/RLS, onboarding/logos, Fundadores, complementar, horários múltiplos/custom e módulos.

`business_settings` e grupos 1/2 são pressupostos pelo loader de configuração;
por isso provisionamento mínimo precisa criá-los mesmo antes da personalização.
Dados opcionais de contato não devem se tornar obrigatórios por esta evolução.

## Auth: e-mail/senha e Google

Confirm Email é desativado manualmente no Supabase. Signup precisa retornar sessão válida; sem sessão, não há aceite. E-mail/senha continuam disponíveis.

Google usa signInWithOAuth no cliente SSR (PKCE), com callback fixo /auth/callback no origin da Server Action. Provider e credenciais são configurados exclusivamente no painel Supabase/Google, nunca no repositório. O callback troca code por sessão e usa resolveUserDestination: convite pendente primeiro, depois Super Admin, Admin ou onboarding.

O convite fica em cookie HttpOnly, SameSite=Lax, Secure em produção, durante uma hora. O callback não recebe token na query e não aceita convite: retorna a /convite para confirmação explícita. Ao expirar o cookie, reabrir o link original. Login existente e cadastro Google seguem o mesmo caminho. E-mail Google nunca é usado para localizar negócio ou conceder membership.

## Criação e configuração


1. Extrair a inicialização base para helper privado reutilizável, se a revisão
   final confirmar que preserva exatamente os defaults do caminho atual.
   Não remover funções em uso. A nova migration redefine somente o necessário.
2. Entrada Platform Admin cria business/configuração sem inserir membership.
   Registrar criador do provisionamento sem representá-lo como owner.
3. Preservar wrappers, validações e claim Fundadores do self-service. Não aplicar
   claim automaticamente ao provisionamento/aceite sem decisão comercial explícita:
   a regra atual está associada ao onboarding concluído, não a todo INSERT.
4. Rota de configuração sob `/super-admin/negocios/[businessId]/configurar`,
   reutilizando BusinessPageContent, ScheduleConfiguration, BusinessHours e
   AppearancePageContent. Módulos continuam no controle existente da PR #68.
5. Injetar Server Actions/contexto explicitamente autorizado nesses componentes.
   O caminho Admin normal continua derivando a membership atual. Não alterar
   globalmente getCurrentBusiness nem usar cookie que troque silenciosamente o
   tenant de outras abas do Admin.
6. Toda entrada com businessId explícito exige requirePlatformAdmin no servidor,
   revalidação no banco e existência do business. Registrar ator/contexto de
   configuração de forma mínima; não criar sistema genérico de audit log.
7. RPC específica de horários Platform Admin delega ao helper privado existente.
   Sem alteração do motor público, concorrência, duração ou disponibilidade.

O modo não é impersonação: auth.uid permanece o operador, sem membership
temporária, service role, acesso falso de owner ou alteração de permissões da Copa,
Financeiro e Fiscal. Estas áreas operacionais não fazem parte do modo de configuração.

## Convites

- `business_invites`: id, business_id, role=owner, token_hash único, status
  pending/accepted/revoked, expires_at, accepted_at/by, revoked_at, created_by,
  created_at/updated_at. Expired derivado do relógio do banco.
- Sem SELECT genérico ou writes diretos para anon/authenticated. RPCs curadas,
  security definer, search_path vazio e grants mínimos.
- Token criptográfico de 32 bytes no servidor; persistir somente SHA-256.
  O hash é também sensível: não retorná-lo em payloads públicos/administrativos.
- Token/link só aparece na resposta imediata da geração. Sem localStorage,
  cache persistente ou recuperação posterior. Recarregar oferece gerar novo link.
- Validade padrão de sete dias centralizada no banco. Regeneração e revogação
  serializadas pelo business; apenas um pending por business/role.
- Gerar novo link revoga anteriores; business com owner não permite convite novo.
- Inspeção retorna status e nome público somente se válido. Não retorna IDs de
  atores, hash ou configuração administrativa.

### Auth e aceite

Abrir `/convite/[token]` valida no servidor sem consumir o convite. Bots de preview
do WhatsApp não devem aceitar nem revogar nada. Não fazer mutations em GET.

CTA explícito guarda o token em cookie HttpOnly, SameSite=Lax, Secure em produção,
path=/ e vida de uma hora (convite válido por sete dias). Signup e login existentes
retornam, após sessão válida, a uma rota fixa do convite sem token na URL; hash
somente server-side antes de RPC. Não há etapa de confirmação de e-mail neste
fluxo. Usuário já autenticado pode ir diretamente ao aceite explícito.
Cookie é apagado após sucesso/abandono. Evitar analytics e referrer de token:
no-store, noindex e Referrer-Policy no-referrer nas superfícies de convite.
Não logar token, hash, cookie ou corpo de erro que os contenha. Logs de acesso da
infraestrutura precisam ser considerados; usar path não os elimina por si só.

Depois de sessão válida, confirmação explícita chama RPC transacional. Resolver
business exclusivamente pelo hash, validar pending/expiração/owner e bloquear
linhas em ordem consistente. Inserir owner e marcar accepted na mesma transação.
Segunda tentativa, inclusive de outro usuário, não cria vínculo. Concorrência
entre convites de negócios distintos para o mesmo usuário também deve ser testada.

Schema é N:N, mas experiência atual seleciona primeira membership: bloquear aceite
para usuário já membro de qualquer negócio, com recuperação amigável. Não vincular
por e-mail. Revisar corrida aceite versus onboarding: serialização deve impedir
dois negócios concorrentes para um usuário sem enfraquecer o self-service.

Após aceite: mostrar nome do negócio, “seu negócio já está pronto”, botão para
/admin. Não executar onboarding, resetar grupos/módulos ou criar segundo business.

## UI

Estado derivado: owner existente → Ativo; pending não expirado → Aguardando acesso;
restante → Preparação. Não confundir com businesses.active (publicação do negócio).

Super Admin: criação mínima, Configurar negócio e Acesso do cliente com geração,
link de cópia única, datas, regeneração/revogação e owner quando disponível.
Convite: reutilizar identidade/componentes existentes, CTA cadastro/login ou
confirmação autenticada; mensagens distintas para inválido/expirado/revogado/usado.
Sem formulário de senha criado em nome do cliente nem novo sistema de Auth.

## Persistência e validação

- 20260908010000_assisted_business_provisioning.sql: base compartilhada, business_invites, auditoria privada e RPCs restritas.
- 20260908011000_invite_platform_admin_guard.sql: rejeita aceite pelo Platform Admin, sem mudar a migration anterior.
- business-invites.test.ts cobre credencial, cookies, destino, signup, login, OAuth/callback simulado, aceite explícito e componentes reais renderizados.
- assisted_business_provisioning.test.sql usa fixtures sintéticas em transação com rollback. Regressões: onboarding, complementar, Fundadores, módulos, RLS e metadata pública.
- Aceite e onboarding compartilham advisory lock por usuário; gerar/revogar/aceitar serializam pelo business. Não é uma suíte de carga com duas conexões simultâneas.
- Validação visual detalhada pendente para Vercel Preview / revisão humana. Login externo Google não é executado por testes automatizados.

Fora do escopo: CRM, cobrança/trial, WhatsApp API, transferência, equipe, múltiplos
owners, impersonação, magic link, automações e mudanças em regras operacionais.
