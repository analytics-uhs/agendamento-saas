import "server-only";

const HOMOLOGATION_ORIGIN = "https://homologacao.focusnfe.com.br";
const TIMEOUT_MS = 20_000;

export type FocusNfcePayload = {
  cnpj_emitente: string;
  data_emissao: string;
  modalidade_frete: string;
  local_destino: string;
  presenca_comprador: string;
  natureza_operacao: string;
  valor_total?: string;
  indicador_inscricao_estadual_destinatario?: string;
  items: ReadonlyArray<Readonly<Record<string, string | number>>>;
  formas_pagamento: ReadonlyArray<Readonly<{ forma_pagamento: string; valor_pagamento: string }>>;
};

export type FocusNfceResult = {
  status: "pending" | "processing" | "authorized" | "rejected" | "cancelled";
  httpStatus: number | null;
  code: string | null;
  message: string | null;
  accessKey: string | null;
  number: string | null;
  series: string | null;
  protocol: string | null;
  xmlUrl: string | null;
  danfceUrl: string | null;
};

export function focusReference(documentId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(documentId)) {
    throw Error("Documento fiscal inválido.");
  }
  return `agendafacil-${documentId.toLowerCase()}`;
}

function assertHomologation(environment: string) {
  if (environment !== "homologation") throw Error("Emissão em produção ainda não está habilitada.");
}

function unresolved(httpStatus: number | null, code = "result_unknown", message = "Não foi possível confirmar o resultado da emissão."): FocusNfceResult {
  return { status: "pending", httpStatus, code, message, accessKey: null, number: null,
    series: null, protocol: null, xmlUrl: null, danfceUrl: null };
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

// Only actual provider-returned paths, on the fixed homologation host; no redirects/credentials.
function downloadUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 2048 || !value.trim()) return null;
  try {
    const url = new URL(value, HOMOLOGATION_ORIGIN);
    if (url.origin !== HOMOLOGATION_ORIGIN || url.username || url.password || url.search || url.hash) return null;
    return url.href;
  } catch { return null; }
}

function mapResponse(raw: unknown, httpStatus: number, reference: string, cnpj: string, token: string): FocusNfceResult {
  const data = object(raw);
  const result = unresolved(httpStatus);
  // Ref/issuer mismatch cannot authorize another tenant's document locally.
  if (data.ref !== reference || data.cnpj_emitente !== cnpj) return result;
  if (httpStatus < 200 || httpStatus >= 300) return result;
  const mapped = { autorizado: "authorized", erro_autorizacao: "rejected",
    processando_autorizacao: "processing", cancelado: "cancelled" } as const;
  if (typeof data.status !== "string" || !Object.hasOwn(mapped, data.status)) return result;
  result.status = mapped[data.status as keyof typeof mapped];
  result.code = null;
  result.message = null;
  const digits = (value: unknown, min: number, max: number) => {
    const text = typeof value === "string" ? value : typeof value === "number" && Number.isSafeInteger(value) ? String(value) : "";
    return new RegExp(`^\\d{${min},${max}}$`).test(text) ? text : null;
  };
  if (result.status === "authorized" || result.status === "cancelled") {
    result.accessKey = digits(typeof data.chave_nfe === "string" ? data.chave_nfe.replace(/^NFe/, "") : null, 44, 44);
    if (!result.accessKey) return unresolved(httpStatus, "invalid_authorization");
    result.number = digits(data.numero, 1, 9);
    result.series = digits(data.serie, 1, 3);
    result.protocol = digits(data.protocolo ?? object(data.protocolo_nota_fiscal).numero_protocolo, 1, 20);
    result.xmlUrl = downloadUrl(data.caminho_xml_nota_fiscal);
    result.danfceUrl = downloadUrl(data.caminho_danfe);
  }
  if (result.status === "rejected") {
    result.code = digits(data.status_sefaz, 1, 6);
    // Never return provider JSON, thrown errors, headers or credentials to the caller.
    const message = typeof data.mensagem_sefaz === "string" ? data.mensagem_sefaz : "NFC-e rejeitada pela SEFAZ.";
    result.message = message.split(token).join("[omitido]")
      .split(Buffer.from(`${token}:`).toString("base64")).join("[omitido]")
      .replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 500);
  }
  const serialized = JSON.stringify(result);
  if (serialized.includes(token) || serialized.includes(Buffer.from(`${token}:`).toString("base64"))) {
    return unresolved(httpStatus, "provider_sensitive_response");
  }
  return result;
}

/** Server-only transport. The service must authorize tenant/module and persist pending BEFORE emit. */
export function createFocusNfeProvider() {
  async function request(method: "POST" | "GET", environment: string, documentId: string, cnpj: string, payload?: FocusNfcePayload) {
    assertHomologation(environment);
    const reference = focusReference(documentId);
    if (!/^\d{14}$/.test(cnpj) || (payload && payload.cnpj_emitente !== cnpj)) throw Error("Emitente fiscal inválido.");
    const token = process.env.FOCUS_NFE_TOKEN?.trim();
    if (!token) throw Error("Integração Focus NFe não configurada.");
    const url = new URL(method === "POST" ? "/v2/nfce" : `/v2/nfce/${reference}`, HOMOLOGATION_ORIGIN);
    if (method === "POST") url.searchParams.set("ref", reference);
    url.searchParams.set("completa", "1");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method, redirect: "error", cache: "no-store", signal: controller.signal,
        headers: { Authorization: `Basic ${Buffer.from(`${token}:`).toString("base64")}`,
          Accept: "application/json", "Content-Type": "application/json" },
        ...(payload ? { body: JSON.stringify(payload) } : {}),
      });
      if (!response.ok) {
        // An HTTP error is not a SEFAZ rejection. Reconcile by GET; never blindly repeat POST.
        return unresolved(response.status, response.status === 401 || response.status === 403 ? "provider_configuration" : "provider_http_error",
          response.status === 401 || response.status === 403 ? "Revise a configuração da integração Focus NFe." : undefined);
      }
      return mapResponse(await response.json(), response.status, reference, cnpj, token);
    } catch {
      return unresolved(null, controller.signal.aborted ? "provider_timeout" : "provider_network_or_response");
    } finally { clearTimeout(timeout); }
  }
  return {
    emitNfce: (environment: string, documentId: string, payload: FocusNfcePayload) => request("POST", environment, documentId, payload.cnpj_emitente, payload),
    getNfce: (environment: string, documentId: string, cnpj: string) => request("GET", environment, documentId, cnpj),
  };
}
