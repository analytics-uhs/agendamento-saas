/** NFC-e tPag codes; fiscal detail only, never a change to the sale/payment ledger. */
export const FISCAL_PAYMENT_LABELS = {
  "01": "Dinheiro",
  "03": "Cartão de Crédito",
  "04": "Cartão de Débito",
  "17": "Pagamento Instantâneo (PIX) – Dinâmico",
  "20": "Pagamento Instantâneo (PIX) – Estático",
  "23": "Pagamento Instantâneo (PIX) - Automático",
} as const;

export type FiscalPaymentCode = keyof typeof FISCAL_PAYMENT_LABELS;
const CODES_BY_SALE_METHOD: Readonly<Record<string, readonly FiscalPaymentCode[]>> = {
  cash: ["01"], card: ["03", "04"], pix: ["17", "20", "23"],
};

export function fiscalPaymentOptions(saleMethod: string | null) {
  const codes = saleMethod && Object.hasOwn(CODES_BY_SALE_METHOD, saleMethod)
    ? CODES_BY_SALE_METHOD[saleMethod] : [];
  return codes.map((code) => ({ code, label: FISCAL_PAYMENT_LABELS[code] }));
}

export function resolveFiscalPayment(saleMethod: string | null, selectedCode: unknown): FiscalPaymentCode {
  const options = fiscalPaymentOptions(saleMethod);
  if (!options.length) throw Error("Forma de pagamento da venda não suportada para emissão.");
  // Cash is the only unambiguous mapping. Never assume credit/debit or a Pix modality.
  if (saleMethod === "cash" && (selectedCode == null || selectedCode === "")) return "01";
  if (typeof selectedCode !== "string" || !options.some(({ code }) => code === selectedCode)) {
    throw Error("Selecione o detalhamento fiscal da forma de pagamento.");
  }
  return selectedCode as FiscalPaymentCode;
}

export function fiscalPaymentReadiness(saleMethod: string | null, selectedCode: unknown) {
  try {
    return { ready: true as const, code: resolveFiscalPayment(saleMethod, selectedCode), missing: [] };
  } catch (error) {
    return { ready: false as const, code: null, missing: [(error as Error).message] };
  }
}

/** Fresh immutable value for the first request snapshot. Persistence must freeze the whole request. */
export function fiscalPaymentSnapshot(saleMethod: string | null, selectedCode: unknown, documentTotal: string) {
  const code = resolveFiscalPayment(saleMethod, selectedCode);
  // Focus vPag Decimal[13.2]. Preserve decimal strings, with no binary rounding.
  if (!/^\d{1,13}\.\d{2}$/.test(documentTotal) || !/[1-9]/.test(documentTotal)) {
    throw Error("Revise o total do documento fiscal.");
  }
  return Object.freeze({ forma_pagamento: code, valor_pagamento: documentTotal });
}
