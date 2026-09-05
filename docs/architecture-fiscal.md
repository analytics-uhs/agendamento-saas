# Fundação fiscal

`sale → fiscal_document → provider` separa o histórico comercial da futura
emissão. Esta etapa prepara apenas NFC-e em `draft`; nenhum provedor, credencial,
API fiscal, XML, PDF ou autorização é simulado. `provider` e respostas externas
permanecem NULL. O lifecycle reserva pending/processing/authorized/rejected/cancelled,
mas não oferece transições: exigirão integração e migration futuras.

`prepare_admin_fiscal_document(p_business_id,p_sale_id)` exige sessão, owner/admin
e módulo `fiscal`, sem depender de `management`. O repository obtém o ID com
`requireBusinessModule("fiscal")`, nunca do browser. Somente vendas completed,
não vazias e com total consistente podem ser preparadas. Lock da venda + unique
(business_id,sale_id,document_type) serializam concorrentes; repetição retorna
o documento existente. Cabeçalho e snapshot são uma transação.

Itens guardam nome do produto no preparo, quantidade e preço da venda. Totais
dos itens preservam cinco casas da multiplicação numeric(14,3) × numeric(12,2);
o total do documento arredonda a soma uma vez para duas casas, como sales.
FKs compostas e trigger verificam tenant, documento, sale_item e produto,
inclusive que o item pertence à mesma venda. UPDATE/DELETE são bloqueados por
triggers; clientes só leem por RLS. Sem edição, exclusão ou reabertura nesta fase.

Preparar não altera venda, estoque ou financeiro. Finalizar venda não prepara
documento automaticamente; a ação opcional aparece no detalhe completed com
fiscal habilitado. Falha na consulta fiscal não impede leitura da venda.
Fiscal tem navegação e rotas próprias; loading/error usam o boundary Admin.

Módulo fiscal permanece inativo por padrão. Habilitação temporária requer
operação administrativa SQL privilegiada, autorizada separadamente, na linha
`business_modules` do negócio. Esta PR não ativa nenhum negócio, não cria billing
nem altera módulos existentes. Próxima fase: escolher/conectar provedor, completar
dados tributários e implementar transições seguras; o snapshot mínimo ainda não
é um payload fiscal pronto para emissão real.
