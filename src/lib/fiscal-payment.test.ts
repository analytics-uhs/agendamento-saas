import assert from "node:assert/strict";
import test from "node:test";
import { fiscalPaymentOptions, fiscalPaymentReadiness, fiscalPaymentSnapshot, resolveFiscalPayment } from "./fiscal-payment";

test("fiscal payment requires explicit card/Pix detail, cash is unambiguous", () => {
  assert.equal(resolveFiscalPayment("cash", undefined), "01");
  assert.equal(resolveFiscalPayment("cash", "01"), "01");
  for (const method of ["card", "pix"]) {
    for (const missing of [undefined, null, "", {}, 3]) {
      assert.throws(() => resolveFiscalPayment(method, missing), /detalhamento/);
      assert.equal(fiscalPaymentReadiness(method, missing).ready, false);
    }
  }
  assert.deepEqual(fiscalPaymentOptions("card").map((p) => p.code), ["03", "04"]);
  assert.deepEqual(fiscalPaymentOptions("pix").map((p) => p.code), ["17", "20", "23"]);
  for (const [method, codes] of [["card", ["03", "04"]], ["pix", ["17", "20", "23"]]] as const) {
    for (const code of codes) assert.equal(fiscalPaymentReadiness(method, code).code, code);
  }
});

test("fiscal detail rejects mismatched payment methods and prototype keys", () => {
  for (const [method, code] of [["cash", "03"], ["card", "20"], ["pix", "03"], ["card", "99"], ["pix", "3"], ["constructor", "01"], ["other", "99"]]) {
    assert.throws(() => resolveFiscalPayment(method, code));
  }
  assert.deepEqual(fiscalPaymentOptions(null), []);
  const options = fiscalPaymentOptions("card");
  options.pop();
  assert.equal(fiscalPaymentOptions("card").length, 2);
});

test("payment snapshot preserves exact fiscal amount and is independent of mutable inputs", () => {
  const sale = { payment_method: "card", total_amount: "39.90" };
  const before = structuredClone(sale);
  const credit = fiscalPaymentSnapshot(sale.payment_method, "03", sale.total_amount);
  assert.deepEqual(credit, { forma_pagamento: "03", valor_pagamento: "39.90" });
  assert.deepEqual(sale, before);
  assert.ok(Object.isFrozen(credit));
  sale.payment_method = "pix";
  const pix = fiscalPaymentSnapshot(sale.payment_method, "20", sale.total_amount);
  assert.equal(credit.forma_pagamento, "03");
  assert.equal(pix.forma_pagamento, "20");
  for (const amount of ["-1.00", "0.00", "NaN", "1e2", "39,90", "1.005", "99999999999999.00"]) {
    assert.throws(() => fiscalPaymentSnapshot("cash", null, amount));
  }
});
