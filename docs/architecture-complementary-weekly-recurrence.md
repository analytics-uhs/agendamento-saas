# Recorrência semanal do Grupo complementar

## Auditoria

`appointment_series` exige start_time/duration/blocks e alimenta materialização
de appointments, inclusive séries permanentes. Não comporta `day`
sem horário fictício ou mudanças invasivas no motor legado.

`create_admin_reservation` cria agregado, Principal opcional, Complementar e
allocations em uma transação. `private.primary_period_is_free` inclui appointments
e calendar_blocks; `resource_allocations` inclui reservas e resource_blocks.
As exclusion constraints continuam sendo a última barreira contra concorrência.
`cancel_admin_reservation` cancela os componentes, cujos triggers liberam ocupação.

## Decisão

Usar `reservation_series`, ligada a reservations com data da ocorrência,
sem criar novo motor de ocupação.
O orquestrador gera datas locais +7 dias, pré-valida todos os recursos/datas e
delega cada agregado ao motor Admin existente dentro da mesma transação.
Qualquer falha reverte série e todos os agregados. Quantidade: 2–260, reutilizando
o limite das séries limitadas atuais. `repeat_count = null` representa permanente,
como no Principal, com horizonte máximo de hoje + 90 dias (America/Sao_Paulo).

Somente Admin e Complementar-only: `day` conserva horas nulas e `time_slot`
conserva o mesmo intervalo local e recurso em todas as semanas. A interface usa
“Repetir semanalmente”, “Permanente” e “Quantidade de repetições”, no mesmo
bloco visual do Principal. O número aparece somente em quantidade; não gera
disponibilidade no frontend.

A migration aditiva `20260913010000` permite contagem nula e persiste o
`recurrence_payload` validado para conservar recurso, cliente e intervalo.
Séries finitas antigas permanecem intactas, sem backfill.
`materialize_recurring_reservations(business_id, series_id, horizon_date)`
segue o contrato operacional do materializador do Principal: RPC autenticada,
horizonte controlado, sem criar infinitas ocorrências ou novo job/scheduler.
A criação chama esse materializador na mesma transação. Novas chamadas ampliam
o horizonte móvel criando somente datas ausentes; datas já existentes, inclusive
canceladas, não são recriadas. O lock da série serializa expansões concorrentes.
Não materializa dias passados. O início de uma permanente deve caber nos 90 dias.
Conflitos abortam toda a criação inicial ou todo o lote de expansão solicitado.

`create_admin_reservation_series` recebe o business resolvido no servidor,
valida owner/admin e recusa um tenant diferente daquele utilizado pelo motor
Admin existente. Locks transacionais de negócio/data e recurso/data são tomados
em ordem; allocations ativas (incluindo blocks) são verificadas com
`private.complementary_period`. Os conflitos retornam datas e recurso em
`DETAIL`, exibidos ao Admin. A criação de cada ocorrência reutiliza
`create_admin_reservation`; falha tardia também reverte todas as ocorrências.

As migrations `20260911010000` e `20260911011000` foram aplicadas na execução
anterior e permanecem intactas. A corretiva `20260912010000` restringe a criação
a Complementar-only e revoga a execução pública/autenticada da RPC de cancelamento
de série criada anteriormente, sem apagar função ou dados. Não existem novas
ações de cancelamento de série na aplicação. O cancelamento individual existente
continua disponível.

Ficam para PR futura: recorrência combinada, recorrência pública e
gerenciamento/cancelamento de série. `appointment_series` e a
recorrência do Principal não são alterados.

Não alterar Auth, público, duração, financeiro, fiscal ou módulos. UI reutiliza
o formulário Admin e seus controles. Validação visual detalhada fica para Preview.

Validação cobre day/time_slot, datas conflitantes, blocks, tenants, rejeição de
combined, rollback tardio e reserva avulsa, com fixtures sintéticas e rollback.
