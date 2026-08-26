<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AgendaFácil — instruções persistentes para agentes

Estas instruções valem para qualquer agente atuando neste repositório.

As autorizações abaixo valem somente dentro do escopo explicitamente solicitado pelo usuário na tarefa atual.

Elas não autorizam o agente a ampliar o escopo por iniciativa própria.

Em caso de conflito entre estas regras e uma instrução explícita do usuário na tarefa atual, seguir a instrução mais específica, exceto quando ela puder causar perda de dados, alteração destrutiva ou risco de produção; nesses casos, solicitar confirmação.

---

## 1. Contexto do produto

Antes de decisões estruturais relevantes, considerar como fontes de verdade:

- `PRODUCT.md`
- `DESIGN.md`
- `docs/database.md`
- `docs/design-system.md`
- demais documentos de arquitetura específicos existentes em `docs/`

Quando a tarefa envolver Grupo principal, Grupo secundário ou Grupo complementar, ler também:

- `docs/architecture-primary-secondary-complementary-groups.md`

Não inventar funcionalidades ou regras que contradigam esses documentos.

---

## 2. Design e interface

Antes de implementar ou alterar interfaces:

1. ler `docs/design-system.md`;
2. ler `DESIGN.md` quando a tarefa envolver direção visual;
3. reutilizar componentes e padrões existentes;
4. evitar criar componentes duplicados quando já houver equivalente;
5. preservar consistência entre desktop e mobile;
6. respeitar `prefers-reduced-motion` quando houver motion;
7. validar acessibilidade, contraste, focus-visible e navegação por teclado.

O Impeccable complementa o Design System, mas não deve redesenhar automaticamente uma interface já aprovada sem solicitação explícita.

Se existirem comps aprovados, a implementação deve priorizar fidelidade aos comps.

---

## 3. Terminologia dos grupos

Na interface e documentação de produto, usar:

- Grupo principal
- Grupo secundário
- Grupo complementar

Preservar os nomes técnicos legados existentes quando aplicável:

- `group_1`
- `group_2`
- `group_1_option_id`
- `group_2_option_id`

Não fazer migrations cosméticas apenas para renomear esses campos.

Usar helpers semânticos centralizados para papel ↔ posição.

Não espalhar verificações como:

- `position === 1`
- `position === 2`
- `position === 3`

quando houver helper existente.

---

## 4. Compatibilidade

Toda evolução deve preservar, salvo instrução explícita em contrário:

- negócios existentes;
- appointments;
- recorrências;
- bloqueios;
- disponibilidade;
- página pública;
- Admin;
- Super Admin;
- notificações;
- Web Push;
- PWA;
- autenticação;
- onboarding;
- contador do Lote Fundadores;
- integrações existentes.

Mudanças aditivas são preferidas a refatorações destrutivas.

Não fazer backfills amplos sem necessidade explícita.

---

## 5. Banco e Supabase

Antes de alterar banco:

1. estudar migrations existentes relevantes;
2. estudar RPCs, RLS, constraints e triggers afetados;
3. verificar se a alteração pode ser aditiva;
4. preservar isolamento multiempresa;
5. não depender apenas de validação frontend para integridade crítica.

Regras críticas de concorrência devem ser garantidas pelo banco sempre que possível.

Mutações públicas sensíveis devem preferencialmente passar por RPCs controladas.

Nunca expor `service_role` no browser.

Não colocar secrets ou credenciais em código versionado.

---

## 6. Regra de migrations

Nunca editar uma migration que já tenha sido aplicada no Supabase remoto.

Qualquer correção posterior deve ser feita por uma nova migration.

Antes de aplicar uma nova migration:

1. executar `supabase db push --dry-run`;
2. revisar exatamente quais migrations serão aplicadas;
3. confirmar que somente migrations esperadas estão pendentes.

Se o dry-run apresentar migration inesperada:

PARAR e informar.

Depois da aplicação, quando aplicável:

- executar `supabase db lint --linked --level warning`;
- executar pgTAP relevante;
- confirmar que o remoto ficou sem migrations pendentes.

---

## 7. Testes pgTAP

Testes pgTAP no Supabase remoto vinculado estão previamente autorizados quando:

- forem necessários para validar migrations, RPCs, RLS, constraints ou regressões;
- forem executados em transação com rollback ou forem comprovadamente não destrutivos;
- não alterarem dados reais de clientes;
- não dependerem de apagar dados reais.

Também está autorizada a repetição de suítes pgTAP após correção de:

- runner;
- parser;
- interpretação de saída;
- fixtures de teste;
- compatibilidade do próprio teste.

Não solicitar confirmação apenas para repetir uma suíte pgTAP segura.

Se o teste precisar tocar dados reais ou executar operação destrutiva:

PARAR e pedir autorização.

---

## 8. Autorizações operacionais prévias

Dentro do escopo solicitado pelo usuário, estão previamente autorizadas:

### Leitura e inspeção

- leitura de arquivos;
- busca no código;
- inspeção de migrations;
- inspeção de schema;
- inspeção de documentação;
- `git status`;
- `git diff`;
- `git log`;
- `git show`;
- `git fetch`;
- demais comandos Git somente de leitura.

### Testes e validações

- `npm test`;
- `npm run lint`;
- `npx tsc --noEmit`;
- `git diff --check`;
- build local;
- `npx next build --webpack`;
- testes pgTAP locais;
- testes pgTAP no Supabase remoto vinculado;
- suítes pgTAP de regressão;
- `supabase db lint`;
- `supabase db push --dry-run`;
- geração e conferência de tipos.

### Git

Quando a tarefa solicitar explicitamente desenvolvimento em branch/PR:

- criar a branch solicitada;
- criar commits relacionados exclusivamente ao escopo aprovado;
- fazer push da branch de trabalho;
- criar Draft PR;
- atualizar Draft PR;
- retargetar PR empilhada para `main` após merge da base;
- rebasear branch sobre `main` quando necessário e seguro.

Não solicitar confirmação adicional para essas ações.

### Migrations

Quando a tarefa solicitar explicitamente uma nova migration, também estão autorizados:

- criar a nova migration;
- executar dry-run;
- aplicar exclusivamente essa nova migration no Supabase remoto já vinculado;
- executar validações e pgTAP após a aplicação.

Isso não autoriza editar migration já aplicada nem executar migration destrutiva fora do escopo.

---

## 9. Ações que sempre exigem confirmação

PARAR e solicitar autorização antes de:

- fazer merge de PR;
- habilitar auto-merge;
- executar `git push --force`;
- executar `git push --force-with-lease`;
- resetar banco remoto;
- executar `db reset` no remoto;
- apagar dados reais;
- executar `DELETE` amplo em dados reais;
- executar `TRUNCATE`;
- executar `DROP TABLE`;
- executar `DROP COLUMN`;
- remover função/RPC em uso;
- alterar migration já aplicada;
- aplicar migration destrutiva não prevista explicitamente;
- alterar secrets;
- alterar tokens;
- alterar credenciais;
- alterar configurações de produção;
- executar deploy manual para produção;
- alterar domínio;
- alterar DNS;
- excluir branch remota;
- modificar dados reais de clientes para teste;
- executar qualquer ação fora do escopo que possa causar perda de dados, indisponibilidade ou dificuldade relevante de reversão.

Se houver dúvida se uma ação é destrutiva ou reversível:

PARAR e pedir confirmação.

---

## 10. Dados reais e testes

Nunca usar dados reais de clientes como fixture de teste.

Preferir:

- transações com rollback;
- UUIDs claramente reservados para teste;
- dados sintéticos;
- ambientes isolados;
- fixtures temporárias.

Testes não devem deixar resíduos no banco remoto.

Se uma suíte criar fixtures, confirmar rollback ou limpeza segura.

---

## 11. Segurança e multiempresa

Toda nova tabela ou superfície deve ser revisada para:

- isolamento por `business_id`;
- RLS;
- grants;
- acesso de `anon`;
- acesso de `authenticated`;
- Super Admin;
- possibilidade de referência cruzada entre negócios.

Quando possível, usar FKs compostas e constraints para impedir referência entre tenants.

Não confiar somente no frontend para isolamento.

---

## 12. Público x Admin

Preservar a distinção entre regras públicas e administrativas.

O Admin pode ter permissões adicionais já definidas no produto, mas isso não significa ignorar:

- conflitos;
- allocations;
- constraints;
- bloqueios;
- isolamento de tenant;
- integridade de dados.

Exceções administrativas devem ser explícitas.

---

## 13. Git e PRs

Para tarefas em PR:

1. partir da base solicitada e atualizada;
2. confirmar worktree antes de iniciar;
3. manter escopo da PR pequeno e revisável;
4. evitar misturar refactors não relacionados;
5. não fazer merge automático;
6. abrir Draft PR quando solicitado.

Antes de concluir uma PR:

- revisar `git status`;
- revisar `git diff`;
- revisar commits;
- confirmar que não há arquivos inesperados.

---

## 14. PRs empilhadas

Quando forem solicitadas stacked PRs:

- cada branch deve nascer da branch anterior;
- cada PR deve apontar para a base imediatamente anterior;
- cada PR deve conter apenas o delta daquela etapa;
- não iniciar a próxima PR antes de a atual estar concluída, testada, commitada e com push.

Após merge da PR-base:

1. retargetar a próxima PR para `main`;
2. atualizar/rebasear a branch se necessário;
3. confirmar que o diff contra `main` contém somente o escopo esperado;
4. repetir validações principais.

Não manter stacks excessivamente longas sem revisão humana.

---

## 15. Controle de limite / checkpoint

Se a capacidade de uso estiver ficando baixa:

não iniciar uma migration, refatoração ou PR grande nova.

Priorizar:

- concluir a etapa atual;
- executar testes;
- commit;
- push;
- deixar worktree limpo;
- registrar checkpoint.

Se precisar interromper, a resposta final deve conter:

### CHECKPOINT DE RETOMADA

PR:

Branch:

Base:

Último commit:

Push realizado: SIM/NÃO

Worktree limpo: SIM/NÃO

### CONCLUÍDO

- ...

### EM ANDAMENTO

- ...

### AINDA NÃO INICIADO

- ...

### MIGRATIONS CRIADAS

- ...

### MIGRATIONS APLICADAS NO REMOTO

- ...

### TESTES APROVADOS

- ...

### TESTES PENDENTES

- ...

### PRÓXIMO PASSO EXATO

- ...

### COMANDO/BRANCH PARA RETOMAR

- ...

Não afirmar que uma PR está concluída quando faltarem migrations, testes obrigatórios ou validações relevantes.

---

## 16. Validações padrão

Quando a tarefa alterar código de aplicação, executar quando aplicável:

- `npm test`
- `npm run lint`
- `npx tsc --noEmit`
- `git diff --check`
- `npx next build --webpack`

Não executar TypeScript e build simultaneamente se ambos puderem disputar a pasta `.next`.

Quando houver migration, adicionar:

- `supabase db push --dry-run`
- `supabase db lint --linked --level warning`
- pgTAP relevante

Quando houver alteração visual, adicionar:

- revisão desktop;
- revisão mobile;
- Impeccable quando aplicável.

---

## 17. Impeccable

Usar Impeccable como apoio para:

- consistência visual;
- hierarquia;
- spacing;
- acessibilidade;
- responsividade;
- detecção de antipadrões.

Warnings preexistentes nas ferramentas do Impeccable não são blocker por si só.

Não alterar arquivos do Impeccable apenas para eliminar warnings de ferramenta, salvo quando solicitado.

Se `.impeccable/design.json` estiver desatualizado em relação ao `DESIGN.md`, sincronizar somente quando solicitado ou quando isso for necessário para a tarefa.

---

## 18. Escopo

Não aproveitar uma tarefa para:

- fazer refactor geral;
- renomear APIs sem necessidade;
- trocar dependências;
- alterar arquitetura não relacionada;
- mexer em tabelas não relacionadas;
- redesenhar outras páginas;
- limpar código fora do escopo.

Se identificar melhoria útil fora do escopo:

registrar como recomendação separada.

---

## 19. Documentação

Atualizar documentação quando a alteração mudar efetivamente:

- comportamento;
- arquitetura;
- schema;
- regras de concorrência;
- fluxo público;
- Admin;
- integrações.

Evitar atualizar documentação antecipadamente com funcionalidade que ainda não existe, salvo documentos explicitamente marcados como arquitetura/proposta.

---

## 20. Entrega final

Ao finalizar uma tarefa relevante, informar de forma objetiva:

- branch;
- PR;
- escopo implementado;
- arquivos relevantes;
- migrations;
- migrations aplicadas;
- decisões técnicas importantes;
- testes executados;
- resultado do build;
- resultado do lint;
- resultado do pgTAP quando houver;
- warnings conhecidos;
- pendências;
- riscos;
- próximo passo recomendado.

Nunca afirmar que algo foi validado se a validação não foi realmente executada.