import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../../", import.meta.url);
const repositoryPath = new URL("src/lib/repositories/founder-offer.ts", projectRoot);

test("carrega o contador no servidor com chave pública, cache curto e fallback", async () => {
  const source = await readFile(repositoryPath, "utf8");

  assert.match(source, /getSupabaseEnvironment/);
  assert.match(source, /REVALIDATE_SECONDS = 60/);
  assert.match(source, /next: \{ revalidate: REVALIDATE_SECONDS \}/);
  assert.match(source, /FOUNDER_OFFER_FALLBACK/);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY/);
});
