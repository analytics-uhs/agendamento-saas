import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { parseSaleInput, saleSubtotal } from "./sales";

const product = "de630000-0000-4000-8000-000000000001";

test("sale parser allowlists fields and preserves exact decimals", () => {
  const value = parseSaleInput({ customer_name: " Cliente ", payment_method: "pix", total_amount: "999", business_id: "bad", items: [{ product_id: product, quantity: "2,500", unit_price: "4,20" }] });
  assert.deepEqual(value, { customer_name: "Cliente", payment_method: "pix", items: [{ product_id: product, quantity: "2.500", unit_price: "4.20" }] });
  assert.equal(saleSubtotal("2.5", "4.2"), 10.5);
});

test("sale parser rejects duplicates and invalid values", () => {
  assert.throws(() => parseSaleInput({ customer_name: "", payment_method: "pix", items: [{ product_id: product, quantity: "1", unit_price: "1" }, { product_id: product, quantity: "2", unit_price: "1" }] }), /repita/);
  for (const item of [{ quantity: "0", unit_price: "1" }, { quantity: "1", unit_price: "-1" }]) assert.throws(() => parseSaleInput({ customer_name: "", payment_method: "cash", items: [{ product_id: product, ...item }] }));
  assert.throws(() => parseSaleInput({ customer_name: "", payment_method: "transfer", items: [{ product_id: product, quantity: "1", unit_price: "1" }] }), /pagamento/);
});

test("real sale flow uses management guard and atomic RPCs", () => {
  const repo = readFileSync("src/lib/repositories/sales.ts", "utf8");
  const migration = readFileSync("supabase/migrations/20260903060000_sales_pos.sql", "utf8");
  const ui = readFileSync("src/components/admin/sale-editor.tsx", "utf8");
  assert.match(repo, /requireBusinessModule\("management"\)/);
  assert.match(repo, /save_admin_sale_draft/);
  assert.match(repo, /complete_admin_sale/);
  assert.match(migration, /for update/i);
  assert.match(migration, /stock_movements_sale_source_unique/);
  assert.match(migration, /source_type='sale'/);
  assert.doesNotMatch(ui, /business_id/);
  assert.doesNotMatch(repo, /\.insert\(|\.update\(|\.delete\(/);
  assert.match(ui, /Salvar rascunho/);
  assert.match(ui, /Finalizar venda/);
});
