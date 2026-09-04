# Motor de estoque

## Fonte de verdade

`stock_movements` é o ledger imutável e a única fonte de verdade do saldo. Cada
linha registra um `quantity_delta` assinado; o saldo é sempre
`sum(quantity_delta)`. `products` não possui `stock_quantity`, saldo inicial ou
cache mutável. Estoque inicial é um `adjustment_in` com motivo explícito.

Os tipos do MVP são `manual_in`, `manual_out`, `adjustment_in`,
`adjustment_out`, `loss`, `purchase`, `sale` e `reversal`. Uma compra em rascunho não
altera saldo; sua confirmação gera exatamente um movimento `purchase` por item,
identificado por `source_type='purchase'` e `source_id=purchase_items.id`.
Quantidades usam `numeric(14,3)` e custo
unitário opcional usa `numeric(12,2)`. O custo é histórico; não calcula custo
médio nem altera o custo de referência do produto.

Uma venda em rascunho também não altera saldo. A finalização cria um movimento
`sale` negativo por item, com `source_type='sale'` e `source_id=sale_items.id`.
Estoque negativo permanece permitido e cada origem só pode gerar uma saída.

## Saldo e situação

`product_stock_balances` é uma view `security_invoker` que agrega o ledger e
inclui produtos sem movimentos com saldo zero. Estoque negativo é permitido.
A classificação é derivada, nunca persistida: negativo quando saldo `< 0`,
baixo quando saldo não negativo, mínimo `> 0` e saldo `<= minimum_stock`, normal
nos demais casos.

## Auditoria e reversão

Clientes não recebem `INSERT`, `UPDATE` ou `DELETE` direto no ledger. Criação e
estorno usam RPCs transacionais. Um estorno cria uma nova linha com delta
exatamente inverso e `reversal_of_id`; o original permanece no histórico. Um
índice único parcial impede duas reversões concorrentes. Estornos não podem ser
estornados; uma correção posterior é uma nova movimentação manual.

`occurred_at` aceita momento operacional retroativo e ordena o histórico;
`created_at` registra a gravação. `created_by` nasce de `auth.uid()`. `source_type`
e `source_id` preparam integrações futuras com Compras e PDV sem criar essas
entidades agora.

## Segurança

A FK composta `(product_id,business_id)` impede referência cruzada entre
tenants. Leitura e RPCs exigem usuário autenticado, papel owner/admin e módulo
`management` ativo por `private.can_manage_business_module`. `anon` e
`service_role` não recebem grants diretos. Toda operação server-side também
passa por `requireBusinessModule("management")` e nunca aceita `business_id` do
browser.

Cancelamento de compra/venda, devoluções, fornecedores estruturados, caixa, financeiro, fiscal, custo médio, lotes,
validade, depósitos e baixa automática permanecem fora desta etapa.
