# Focus NFe — homologação (PR #67)

## Estado e cobertura

Implementados: preparação de payload, readiness, pagamento explícito, claim e
snapshot imutável no banco, transporte server-only, reconciliação, Server Actions
e UI de emissão/consulta. Transporte validado com mocks, banco com pgTAP remoto
em rollback. **Nenhuma emissão real à Focus foi realizada**: interoperabilidade
externa e autorização SEFAZ ainda exigem teste autorizado de homologação.

Cobertura deliberadamente restrita a CRT 1 em 2026, venda interna presencial
simples, consumidor não identificado, sem frete, ST/IPI ou produtos com exigências
especiais, mesma unidade comercial/tributável. CSOSN 102/103/300/400, PIS e COFINS
04/06/07/08/09, CFOP 5101/5102; CEST preenchido bloqueia este fluxo. O usuário
confirma explicitamente esse enquadramento. Não é um motor tributário geral.

## Contratos oficiais consultados em 06/09/2026

- [Ambientes](https://doc.focusnfe.com.br/reference/ambiente).
- [Autenticação](https://doc.focusnfe.com.br/reference/autenticacao).
- [NFC-e síncrona](https://doc.focusnfe.com.br/reference/nfce).
- [Emitir e respectivos exemplos OpenAPI](https://doc.focusnfe.com.br/reference/emitir_nfce).
- [Consultar e respectivos exemplos OpenAPI](https://doc.focusnfe.com.br/reference/consultar_nfce).
- [Campos, incluindo formas_pagamento/tPag](https://campos.focusnfe.com.br/nfe/NotaFiscalXML.html#forma_pagamento).
- [Campos dos itens](https://campos.focusnfe.com.br/nfe/ItemNotaFiscalXML.html).
- [Reforma tributária](https://focusnfe.com.br/guides/reforma-tributaria/): IBS/CBS facultativo para Simples em 2026; outros regimes/anos ficam bloqueados até revisão.

## Dados exigidos e responsabilidade

O negócio cadastra seus dados fiscais e configura certificado, CSC e emitente
diretamente na Focus. O produto cadastra NCM, CFOP, origem, CSOSN, unidade fiscal,
GTIN (ou declaração explícita `SEM GTIN`), CST de PIS e COFINS. Nenhum desses
dados é inferido do cadastro comercial. Códigos com base/alíquota condicionais
ficam bloqueados nesta versão, em vez de enviar zeros inventados.

Descrição, quantidade, preço e total vêm do snapshot do documento preparado da
venda. Valores são conferidos com aritmética decimal inteira; divergências de
arredondamento bloqueiam emissão. As escolhas de pagamento pertencem ao Fiscal.
As exigências foram registradas na PR antes da migration; não houve alteração
semântica de Venda, Estoque ou Financeiro.

`POST /v2/nfce?ref=agendafacil-{document_uuid}&completa=1` e
`GET /v2/nfce/agendafacil-{document_uuid}?completa=1` usam exclusivamente
`https://homologacao.focusnfe.com.br`. Nenhuma base URL é aceita do chamador.
HTTP Basic usa o token como usuário e senha vazia. `FOCUS_NFE_TOKEN` é server-only;
o exemplo de ambiente contém apenas seu nome, nunca uma credencial real.
Timeout de 20 segundos, `no-store`, redirecionamentos bloqueados, sem retry de POST.

## Detalhamento fiscal aprovado

`sale.payment_method` permanece `cash|card|pix`. O domínio Fiscal oferece:

| Método comercial | Código fiscal | Nome na documentação |
| --- | --- | --- |
| cash | 01 | Dinheiro |
| card | 03 | Cartão de Crédito |
| card | 04 | Cartão de Débito |
| pix | 17 | Pagamento Instantâneo (PIX) – Dinâmico |
| pix | 20 | Pagamento Instantâneo (PIX) – Estático |
| pix | 23 | Pagamento Instantâneo (PIX) - Automático |

Somente `cash → 01` é automático. Card/Pix sem escolha explícita não passam na
prontidão de pagamento. Códigos de outra família e códigos fora do escopo são
rejeitados. O helper gera uma cópia imutável de `forma_pagamento` e
`valor_pagamento`, preservando o total decimal do documento, não o preço atual.

A escolha é gravada em `provider_request_snapshot` no primeiro claim e não pode
ser alterada depois. Card/Pix exigem `tipo_integracao` explícito: 1 integrado,
2 não integrado. Integrado exige CNPJ da credenciadora e autorização; bandeira
pode ser informada. Não inferimos TEF/POS, adquirente ou autorização. Não há
suporte a split/parcelas/caixa.

## Respostas e recuperação

O transporte valida simultaneamente `ref`, CNPJ e resposta HTTP antes de mapear:

| Status Focus | Status de domínio retornado |
| --- | --- |
| autorizado | authorized, exigindo chave com 44 dígitos |
| erro_autorizacao | rejected, com código SEFAZ e mensagem limitada/sanitizada |
| processando_autorizacao | processing |
| cancelado | cancelled (somente leitura; sem operação de cancelamento) |
| desconhecido, timeout, erro de rede/HTTP/JSON ou identificação divergente | pending/incerto |

Campos mapeados: `chave_nfe` (sem prefixo NFe), `numero`, `serie`, `protocolo`
ou `protocolo_nota_fiscal.numero_protocolo`, `caminho_xml_nota_fiscal` e
`caminho_danfe`. DANFCe pode ser HTML, **não presumir PDF**. Caminhos relativos
são resolvidos apenas no host de homologação; URLs externas/com credenciais ou
query strings são descartadas. Nunca inventar um endereço de download.

Não retornamos payload bruto, headers, requisição completa do provider nem
exceções HTTP. Respostas que contenham o token/base64 da autenticação falham
fechadas. Não há logging de requests. Erros de autenticação geram mensagem
genérica de configuração, não rejeição SEFAZ.

O claim persiste `pending` + referência + snapshot **antes**
do HTTP, em transação curta. Repetições consultam a mesma referência. Inicialmente
não oferecer reenvio de rejected; a documentação apresenta `already_processed`
e `pending_operation`, mas não usamos isso como autorização para reenvio cego.
Um lock de documento e lease privado de 60 segundos serializam operações;
nonce impede persistir resposta de um claim substituído. Após timeout, inclusive
falha entre commit e HTTP, só consultar a referência: não arriscar dupla emissão.
Isso pode exigir reconciliação operacional quando o POST não chegou à Focus.

`get_admin_fiscal_emission_context` usa current business explícito e módulo Fiscal.
`claim_fiscal_dispatch` e `record_fiscal_dispatch` só possuem EXECUTE para
service_role no servidor; o claim revalida ator/membership/módulo e contexto.
Authenticated não pode forjar autorização. Resultado é normalizado e curado,
sem resposta bruta; estados terminais não regridem por resposta transitória.

## Operação e limites

Emissor, certificado e CSC/configurações técnicas ficam no painel Focus.
AgendaFácil não recebe/manipula/armazena certificado ou senha. A única credencial
prevista nesta etapa é `FOCUS_NFE_TOKEN`; credencial por negócio é evolução futura.
Produção é bloqueada pelo transporte, serviço e claim no banco. Nenhuma chamada
real foi feita. Teste externo exige token,
empresa de homologação e autorização explícita; não usar dados inventados.

Validação visual detalhada pendente para Vercel Preview / revisão humana.
