# Catálogo de produtos

## Escopo atual

O catálogo pertence ao módulo `management` e registra categorias e produtos
vendidos pelo negócio. Ele ainda não representa estoque, compra ou venda.

- `product_categories`: categoria plana, ativável e única por nome sem diferença
  entre maiúsculas/minúsculas dentro do tenant;
- `products`: nome, categoria opcional, SKU, código de barras, unidade, custo de
  referência, preço padrão de venda, estoque mínimo configurado e status;
- unidades: `UN`, `KG`, `G`, `L` e `ML`;
- dinheiro: `numeric(12,2)`; quantidade mínima: `numeric(12,3)`;
- a UI inativa e reativa registros, mas não os exclui fisicamente.

Não existe `stock_quantity`, `current_stock` ou `stock_balance` em `products`.
O saldo futuro terá como fonte de verdade um ledger `stock_movements` ainda não
implementado. `minimum_stock` é somente a configuração para um alerta futuro, e
`cost_price` é referência, não custo médio de estoque.

## Integridade, segurança e módulos

Todas as chaves de negócio são derivadas da sessão no servidor. A FK composta
`(category_id, business_id)` impede categoria de outro tenant mesmo fora da UI.
SKU é normalizado para maiúsculas e é único por tenant sem diferença de caixa;
barcode permanece texto, preserva zeros iniciais e é único por tenant. Nome de
categoria tem unicidade case-insensitive. Valores negativos, unidade inválida,
NaN e infinito são rejeitados no banco.

RLS exige owner/admin do negócio e `management=true`, por meio do helper privado
`can_manage_business_module`. Isso vale para leitura e escrita; não há acesso
anon ou service role. Grants permitem SELECT/INSERT e UPDATE apenas das colunas
editáveis, sem DELETE ou alteração de `business_id`, IDs e timestamps. A rota e
o repository também executam `requireBusinessModule("management")`.

Categorias inativas não podem receber novos produtos. Produtos já ligados a
elas mantêm o vínculo e continuam editáveis, preservando o histórico. Categoria
não é removida em cascata ao produto.

## Aplicação

`/admin/produtos` aparece na navegação somente com Gestão ativa. O repository
server-only lista e pagina produtos (30 por página), pesquisa nome/SKU/barcode,
filtra categoria/status e implementa as mutações. As Server Actions não aceitam
`business_id`. Os formulários enviam decimais normalizados como string para não
introduzir aritmética binária na persistência.

O catálogo prepara o preço padrão para um futuro PDV. Compras, fornecedores,
vendas, movimentos, saldo, caixa, pagamentos e campos/documentos fiscais estão
explicitamente fora desta fase. Campos fiscais pertencem ao módulo `fiscal`.
