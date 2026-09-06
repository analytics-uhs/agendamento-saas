# Fundação fiscal

## Integração Focus NFe em desenvolvimento

A PR #67 iniciou o transporte server-only de homologação e os helpers de
pagamento fiscal explícito. Ainda **não conecta emissão à UI/banco**; o lifecycle
e o snapshot persistido abaixo permanecem como na fundação. Card/Pix não recebem
default fiscal; Dinheiro possui mapeamento inequívoco. Consulte o
[checkpoint Focus NFe](integrations/focus-nfe.md) para contratos, testes e pendências.

## Configuração cadastral fiscal

`business_fiscal_settings` mantém dados do emitente e endereço estruturado.
`businesses.name` é nome comercial e `businesses.address` é texto livre: não são
fonte oficial de razão social/endereço fiscal. Não há cópia automática.
`product_fiscal_settings` é 1:1 por produto, com FK composta para o tenant.
Nenhuma tabela comercial, snapshot fiscal ou finalização foi alterada.

Campos vazios podem ser salvos para completar o cadastro gradualmente. Formatos
preenchidos são validados: CNPJ 14 dígitos, CEP 8, município IBGE 7, UF 2 letras,
NCM 8, CEST opcional 7, CFOP 4, origem 0–8. Banco normaliza pontuação numérica,
trim e uppercase de UF/IE. CNPJ é validação de formato, não consulta cadastral ou
validação de existência. IE é texto (inclusive ISENTO); não há regra estadual.

CRT é armazenado como texto 1/2/3. ICMS separa `icms_code_type=csosn|cst`
de `icms_code` (3/2 dígitos). Prontidão marca incompatibilidade se CRT 1 não usar
CSOSN ou CRT 2/3 não usar CST. Formato não significa adequação tributária: não
escolhemos códigos nem implementamos validações por UF, catálogo tributário ou
cálculo. CRT 4/MEI não é oferecido nesta etapa de escopo 1/2/3.

`getFiscalReadiness` e `getProductFiscalReadiness` indicam **completude cadastral**,
nunca “pronto para emitir”. Negócio exige IE preenchida ou ISENTO; produto exige
NCM/CFOP/origem/tipo/código ICMS e regime compatível. CEST não é inferido como
obrigatório. Mudança de CRT pode deixar produtos incompletos, sem bloquear venda.

Ambiente default `homologation`; `production` pode ser salvo mas não habilita
emissão. RPCs de configuração exigem current business explícito e módulo fiscal,
com normalização no banco e escrita direta revogada. Repositories ignoram IDs
de negócio enviados pelo browser. A página fica em `/admin/fiscal/configuracao`.
No editor de Produtos, a seção aparece somente com Fiscal ativo. Produto novo
é salvo primeiro e recebe dados fiscais na edição; salvamentos comercial/fiscal
são independentes. A preparação local da #65 não exige esses dados e documentos
anteriores não são migrados.

Fontes oficiais para os códigos (consulta limitada em setembro/2026):

- [MOC 7.0, Anexo I — origem, CRT e ICMS](https://www.confaz.fazenda.gov.br/legislacao/arquivo-manuais/moc7-anexo-i-leiaute-e-rv.pdf).
- [Portal NF-e — CRT/CSOSN](https://www.nfe.fazenda.gov.br/Portal/perguntasFrequentes.aspx?AspxAutoDetectCookieSupport=1&tipoConteudo=S%2FEAGUrzRyk%3D).
- [NT 2024.001 — CRT MEI](https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=kIiniiSkpKc%3D): extensão CRT 4 conhecida, fora do escopo solicitado.

Sem provider real, credenciais, certificado, CSC ou emissão. Antes de integrar
um provider será necessário revisar os requisitos fiscais vigentes, incluindo
regimes e regras não cobertos por esta configuração mínima.

## Preparação local

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
