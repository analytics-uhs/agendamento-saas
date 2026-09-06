import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { createFocusNfeProvider, focusReference, FocusNfcePayload } from "./providers/focus-nfe";

const DOCUMENT = "de670000-0000-4000-8000-000000000001";
const REF = `agendafacil-${DOCUMENT}`;
const CNPJ = "12345678000123";
const TOKEN = "synthetic-secret-for-mocked-http";
const KEY = "41190612345678000123650010000000121743484310";
const payload: FocusNfcePayload = {
  cnpj_emitente: CNPJ, data_emissao: "2026-09-06T12:00:00-03:00", modalidade_frete: "9",
  local_destino: "1", presenca_comprador: "1", natureza_operacao: "VENDA AO CONSUMIDOR",
  items: [{ numero_item: "1", descricao: "Produto sintético", quantidade_comercial: "1.000", valor_unitario_comercial: "10.00" }],
  formas_pagamento: [{ forma_pagamento: "01", valor_pagamento: "10.00" }],
};
const authorized = { ref: REF, cnpj_emitente: CNPJ, status: "autorizado", chave_nfe: `NFe${KEY}`,
  numero: "12", serie: "1", protocolo: "232260176682690", caminho_xml_nota_fiscal: "/arquivos/test.xml",
  caminho_danfe: "/notas_fiscais_consumidor/test.html" };
const compiled = ts.transpileModule(readFileSync("src/lib/providers/focus-nfe.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness(response: unknown = authorized, status = 201, token: string | undefined = TOKEN, mode?: "network" | "timeout" | "json") {
  const calls: { url: URL; init: RequestInit }[] = [];
  let timeout: (() => void) | undefined;
  let cleared = false;
  const exports = {} as { createFocusNfeProvider: typeof createFocusNfeProvider; focusReference: typeof focusReference };
  runInNewContext(compiled, {
    exports, require: (name: string) => { assert.equal(name, "server-only"); return {}; },
    URL, Buffer, AbortController, process: { env: { FOCUS_NFE_TOKEN: token } },
    setTimeout: (fn: () => void, ms: number) => { assert.equal(ms, 20_000); timeout = fn; return 1; },
    clearTimeout: () => { cleared = true; },
    fetch: async (url: URL, init: RequestInit) => {
      calls.push({ url, init });
      if (mode === "timeout") { timeout!(); throw Error(`Abort ${TOKEN}`); }
      if (mode === "network") throw Error(`Authorization: ${TOKEN}`);
      return { status, ok: status >= 200 && status < 300, json: async () => {
        if (mode === "json") throw Error(`invalid JSON ${TOKEN}`);
        return response;
      } };
    },
  });
  return { ...exports, provider: exports.createFocusNfeProvider(), calls, cleared: () => cleared };
}

test("Focus uses only homologation, Basic token with empty password, fixed ref and exact payload", async () => {
  const h = harness();
  const result = await h.provider.emitNfce("homologation", DOCUMENT, payload);
  assert.equal(h.calls.length, 1);
  const { url, init } = h.calls[0];
  assert.equal(url.origin, "https://homologacao.focusnfe.com.br");
  assert.equal(url.pathname, "/v2/nfce");
  assert.equal(url.searchParams.get("ref"), REF);
  assert.equal(url.searchParams.get("completa"), "1");
  assert.equal(init.method, "POST");
  assert.equal(init.redirect, "error");
  assert.equal(init.cache, "no-store");
  assert.equal((init.headers as Record<string, string>).Authorization, `Basic ${Buffer.from(`${TOKEN}:`).toString("base64")}`);
  assert.deepEqual(JSON.parse(String(init.body)), payload);
  assert.equal(result.status, "authorized");
  assert.equal(result.accessKey, KEY);
  assert.equal(result.number, "12");
  assert.equal(result.protocol, authorized.protocolo);
  assert.equal(result.xmlUrl, "https://homologacao.focusnfe.com.br/arquivos/test.xml");
  assert.equal(result.danfceUrl, "https://homologacao.focusnfe.com.br/notas_fiscais_consumidor/test.html");
  assert.ok(!JSON.stringify(result).includes(TOKEN));
  assert.ok(h.cleared());
});

test("production, missing token and malformed identifiers fail before HTTP", async () => {
  const h = harness();
  for (const environment of ["production", "", "HOMOLOGATION", "https://api.focusnfe.com.br"]) {
    await assert.rejects(h.provider.emitNfce(environment, DOCUMENT, payload), /produção/);
    await assert.rejects(h.provider.getNfce(environment, DOCUMENT, CNPJ), /produção/);
  }
  await assert.rejects(h.provider.emitNfce("homologation", "../other", payload), /inválido/);
  await assert.rejects(h.provider.getNfce("homologation", DOCUMENT, "bad"), /inválido/);
  assert.equal(h.calls.length, 0);
  const absent = harness(authorized, 201, "");
  await assert.rejects(absent.provider.emitNfce("homologation", DOCUMENT, payload), /não configurada/);
  assert.equal(absent.calls.length, 0);
});

test("query recovers the same reference without POST and reads protocol from complete response", async () => {
  const h = harness({ ...authorized, protocolo: undefined, protocolo_nota_fiscal: { numero_protocolo: "123456789012345" } }, 200);
  assert.equal(h.focusReference(DOCUMENT.toUpperCase()), REF);
  const result = await h.provider.getNfce("homologation", DOCUMENT, CNPJ);
  assert.equal(result.protocol, "123456789012345");
  assert.equal(h.calls[0].init.method, "GET");
  assert.equal(h.calls[0].init.body, undefined);
  assert.equal(h.calls[0].url.pathname, `/v2/nfce/${REF}`);
});

test("SEFAZ rejection on HTTP success is not an authorization; secrets/raw payload are removed", async () => {
  const h = harness({ ...authorized, status: "erro_autorizacao", status_sefaz: "704",
    mensagem_sefaz: `Rejeição ${TOKEN} ${Buffer.from(`${TOKEN}:`).toString("base64")}`,
    authorization: TOKEN, extra: { secret: TOKEN } });
  const result = await h.provider.emitNfce("homologation", DOCUMENT, payload);
  assert.equal(result.status, "rejected");
  assert.equal(result.code, "704");
  assert.match(result.message!, /Rejeição/);
  assert.ok(!JSON.stringify(result).includes(TOKEN));
  assert.ok(!JSON.stringify(result).includes(Buffer.from(`${TOKEN}:`).toString("base64")));
  assert.equal(result.accessKey, null);
  assert.equal(result.xmlUrl, null);
});

test("network, timeout and malformed JSON stay uncertain without retries", async () => {
  for (const mode of ["network", "timeout", "json"] as const) {
    const h = harness(authorized, 201, TOKEN, mode);
    const result = await h.provider.emitNfce("homologation", DOCUMENT, payload);
    assert.equal(result.status, "pending");
    assert.equal(h.calls.length, 1);
    assert.ok(h.cleared());
    assert.ok(!JSON.stringify(result).includes(TOKEN));
    if (mode === "timeout") assert.equal(result.code, "provider_timeout");
  }
});

test("unknown status, HTTP failure, wrong ref/issuer and invalid authorization fail closed", async () => {
  for (const raw of [null, [], {}, { ...authorized, ref: "another" }, { ...authorized, cnpj_emitente: "00000000000000" },
    { ...authorized, status: "authorized" }, { ...authorized, status: "contingencia_offline" }, { ...authorized, chave_nfe: null }]) {
    assert.equal((await harness(raw).provider.getNfce("homologation", DOCUMENT, CNPJ)).status, "pending");
  }
  for (const status of [301, 400, 401, 403, 404, 422, 500]) {
    const result = await harness(authorized, status).provider.emitNfce("homologation", DOCUMENT, payload);
    assert.equal(result.status, "pending");
    assert.equal(result.httpStatus, status);
  }
});

test("processing and cancelled are explicitly mapped; external or credentialed download URLs are discarded", async () => {
  assert.equal((await harness({ ...authorized, status: "processando_autorizacao" }).provider.getNfce("homologation", DOCUMENT, CNPJ)).status, "processing");
  assert.equal((await harness({ ...authorized, status: "cancelado" }).provider.getNfce("homologation", DOCUMENT, CNPJ)).status, "cancelled");
  for (const path of ["javascript:alert(1)", "https://api.focusnfe.com.br/file", "//evil.example/file", "https://user:password@homologacao.focusnfe.com.br/file", "/file?token=secret", ""]) {
    const result = await harness({ ...authorized, caminho_xml_nota_fiscal: path, caminho_danfe: path }).provider.getNfce("homologation", DOCUMENT, CNPJ);
    assert.equal(result.xmlUrl, null);
    assert.equal(result.danfceUrl, null);
  }
  const sensitive = await harness({ ...authorized, caminho_danfe: `/file/${TOKEN}` }).provider.getNfce("homologation", DOCUMENT, CNPJ);
  assert.equal(sensitive.status, "pending");
  assert.ok(!JSON.stringify(sensitive).includes(TOKEN));
});
