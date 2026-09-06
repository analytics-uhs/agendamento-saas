# Focus NFe — homologação (implementação parcial da PR #67)

## Estado deste checkpoint

Implementados e testados por mocks: transporte HTTP server-only e validação do
detalhamento fiscal de pagamento. **Ainda não existe emissão acionável pela UI**.
Nenhuma migration foi criada/aplicada nesta etapa. Não foram alterados venda,
itens, estoque, financeiro, RLS ou o lifecycle dos documentos fiscais.

Faltam: payload fiscal completo/readiness tributário, claim transacional de envio,
snapshot persistido imutável, reconciliação no banco, Server Actions e interface.
Os helpers não substituem essas garantias. Não considerar a integração concluída.

## Contratos oficiais consultados em 06/09/2026

- [Ambientes](https://doc.focusnfe.com.br/reference/ambiente).
- [Autenticação](https://doc.focusnfe.com.br/reference/autenticacao).
- [NFC-e síncrona](https://doc.focusnfe.com.br/reference/nfce).
- [Emitir e respectivos exemplos OpenAPI](https://doc.focusnfe.com.br/reference/emitir_nfce).
- [Consultar e respectivos exemplos OpenAPI](https://doc.focusnfe.com.br/reference/consultar_nfce).
- [Campos, incluindo formas_pagamento/tPag](https://campos.focusnfe.com.br/nfe/NotaFiscalXML.html#forma_pagamento).

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

**Persistência ainda pendente:** a escolha deverá ser feita na preparação da
emissão e gravada no snapshot do primeiro envio, nunca na venda/Financeiro.
`Object.freeze` no helper não é garantia de imutabilidade de banco: a nova
migration deverá assegurar isso inclusive contra concorrência/repetições.

O código tPag sozinho não cobre todos os campos condicionais de pagamento.
O serviço ainda deverá validar `tipo_integracao` e dados técnicos exigidos para
o caso concreto. Não inferir integração TEF/POS nem preencher adquirente,
autorização ou outros dados inexistentes. Não há suporte a split/parcelas/caixa.

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

A futura orquestração deve persistir `pending` + referência + snapshot **antes**
do HTTP, em transação curta. Repetições consultam a mesma referência. Inicialmente
não oferecer reenvio de rejected; a documentação apresenta `already_processed`
e `pending_operation`, mas não usamos isso como autorização para reenvio cego.
Ainda falta testar/construir essa coordenação no banco; o transporte por si só
não impede duas invocações concorrentes pelo serviço.

## Próxima etapa exata

1. Revisar campos obrigatórios/condicionais de ICMS/PIS/COFINS/IBS/CBS e unidade
   fiscal. O cadastro atual possui apenas NCM/CEST/CFOP/origem/tipo/código ICMS;
   não inventar alíquotas, CSTs ou zeros. Readiness cadastral não é tributário.
2. Ler migration list/dry-run, criar migration aditiva com referência única,
   snapshot imutável e claim/reconciliação protegidos. Chamadas autenticadas não
   podem forjar resultado `authorized` enviando um JSON de provider ao banco.
3. Orquestrar current business + módulo Fiscal + documento/emitente/produtos +
   pagamento fiscal explícito, sem depender de management para autorização fiscal.
4. UI mínima de homologação/confirmação/atualização; segunda barreira de ambiente
   no serviço; testes de domínio e pgTAP, regressões, validações e atualização PR.

## Operação e limites

Emissor, certificado e CSC/configurações técnicas ficam no painel Focus.
AgendaFácil não recebe/manipula/armazena certificado ou senha. A única credencial
prevista nesta etapa é `FOCUS_NFE_TOKEN`; credencial por negócio é evolução futura.
Produção é bloqueada pelo cliente; a barreira adicional do serviço ainda precisa
ser implementada. Nenhuma chamada real foi feita. Teste externo exige token,
empresa de homologação e autorização explícita; não usar dados inventados.

Validação visual detalhada pendente para Vercel Preview / revisão humana.
