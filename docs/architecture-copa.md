# Copa — comandas e venda no balcão

## Auditoria e reutilização

Antes desta PR, `sales` já persistia drafts e `sale_items` permitia sua edição.
O PDV salvava todas as linhas e depois chamava `complete_admin_sale`. Essa RPC
bloqueia a venda, valida draft/pagamento/itens e grava, na mesma transação,
completed, um movimento negativo por item e o recebimento do saldo restante.
Triggers tornam completed imutável; locks/status impedem fechamento duplicado.
Essas regras e a RPC de conclusão permanecem como motor único.

## Modelo

Migration `20260906040000_copa_tabs.sql`: `sales.sale_type` (`quick|tab`, default
`quick`), `tab_name` obrigatório apenas para tab, e `revision` incremental.
Na interface, `quick` é **Balcão** e `tab` é **Comanda**. Valores e rotas técnicas
permanecem iguais; não há um novo motor por causa dessa nomenclatura.
Vendas anteriores correspondem ao PDV rápido; defaults não recriam vendas nem
alteram valores/itens. Identificação de comanda não ocupa customer_name.

Comanda é `tab + draft`. Abrir, adicionar, diminuir e remover persistem no servidor,
sem estoque reservado, sem financeiro automático e sem documento fiscal.
Recebimentos explícitos podem ser registrados no detalhe, sem fechar a comanda.
Total/recebido/restante e histórico vêm da camada financeira compartilhada com Agenda.
O total dos itens pode mudar, mas nunca ficar abaixo do já recebido; essa regra
é garantida no banco e uma falha reverte itens, total e revisão. Preços já salvos
continuam sendo snapshots. Não existe estorno automático.
O UUID de abertura é estável por tentativa, impedindo abertura duplicada no retry.
Balcão usa o mesmo editor e cria seu draft no primeiro produto; a URL
preserva o ID para recarregar/retomar. Drafts rápidos também podem ser retomados
pelo histórico. Omitir a identificação não cria um cliente fictício.

## Concorrência e segurança

As RPCs `open_admin_copa_sale`, `set_admin_copa_item` e
`complete_admin_copa_sale` recebem business_id exclusivamente do repository com
`requireBusinessModule("management")`. Banco revalida auth, membership, módulo,
tenant, tipo e status. EXECUTE authenticated, sem writes diretos nem service role.
RLS existente continua protegendo leituras.

Mutações adquirem FOR UPDATE na venda e comparam revision esperada. Uma segunda
tela desatualizada recebe `copa_stale`, sem sobrescrever silenciosamente a primeira.
O editor recarrega o estado e pede conferência. Triggers protegem comandas também
contra o antigo editor bulk, que não possui contrato de revisão. O marcador
transacional privado de escrita não substitui autorização; não existe RPC pública
que permita definí-lo e as tabelas continuam sem grants de escrita ao cliente.

Cada nova linha usa products.sale_price; incrementos preservam unit_price já salvo.
Quantidade inteira positiva; zero remove a linha. Apenas produtos UN ativos são
oferecidos para novas adições; item já existente de produto inativado permanece.
Limite de 200 produtos distintos conserva o limite do editor anterior.

Fechar valida revisão/pagamento e delega à **mesma** complete_admin_sale na mesma
transação. Falha reverte também a forma de pagamento. Double-submit é rejeitado
por status/lock, além da unicidade de origem do estoque. O financeiro cobra apenas
o restante e cada recebimento explícito possui chave de idempotência. Estoque negativo
continua permitido. Fiscal permanece uma ação explícita no detalhe completed;
nenhuma chamada Focus acontece ao pagar.

Comanda integralmente quitada fecha sem escolher outra forma de pagamento e sem
novo lançamento (nem valor zero). A UI consulta o restante ao clicar em Fechar;
as RPCs revalidam o saldo sob lock. A corretiva `20260915010000_close_paid_tabs.sql`
permite payment_method nulo em completed somente para tab quitada, validada pelo
trigger contra o ledger. Não inventa um método a partir dos recebimentos.
Balcão e comanda com saldo continuam exigindo método no fechamento.

## Interface e compatibilidade

`/admin/copa` lista todas as comandas abertas por updated_at, mais cinco últimas
vendas. `/admin/copa/comandas/[saleId]` e `/admin/copa/venda-rapida?id=...` usam
CopaEditor. `/admin/pdv` redireciona; detalhes draft no histórico abrem esse editor.
SaleEditor agora é somente leitura histórica, com integração Fiscal preservada.
Navegação centralizada oferece Copa, sem itens redundantes PDV/Vendas; histórico
fica acessível pela Copa. Rotas técnicas de compras não mudam, mas a UI usa Entradas.

Produtos novos usam UN/un, SKU e barcode ficam em Mais opções; dados fiscais
continuam separados. Produtos legados de outras unidades **não são convertidos**;
mantêm edição/consulta e histórico, mas não são oferecidos na operação unitária.
Drafts legados com itens fracionários/não-UN não podem ser fechados pela Copa
sem remover/revisar esses itens; completed histórico permanece íntegro. Não há
arredondamento nem alteração automática de quantidades antigas.
Estoque preserva saldo/histórico/reversões e destaca Entrada e Ajustar.

## Limites

Sem mesas estruturadas, QR, divisão por item, caixa, impressão,
reserva de estoque ou integração automática com Agenda/Fiscal. Histórico da última
alteração não é auditoria completa por item. Respostas de rede incertas exigem
recarregar/conferir antes de tentar novamente.

Validação visual detalhada pendente para Vercel Preview / revisão humana.
