import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(join(process.cwd(), "src/components/admin/admin-shell.tsx"), "utf8");
const mobileHeader = source.slice(source.indexOf('<header className="sticky'), source.indexOf("</header>") + 9);
const desktopAside = source.slice(source.indexOf('<aside className="fixed'), source.indexOf("</aside>") + 8);

test("header mobile mantém logo e sino sem renderizar o nome visível do negócio", () => {
  assert.match(mobileHeader, /BusinessLogo/);
  assert.match(mobileHeader, /AdminNotificationBell/);
  assert.doesNotMatch(mobileHeader, /<span[^>]*>\{business\.name\}<\/span>/);
});

test("header mobile usa ícone para abrir a página pública antes do sino", () => {
  assert.doesNotMatch(mobileHeader, />Ver página</);
  assert.match(mobileHeader, /aria-label="Abrir página pública"/);
  assert.match(mobileHeader, /title="Abrir página pública"/);
  assert.match(mobileHeader, /target="_blank"/);
  assert.match(mobileHeader, /rel="noopener noreferrer"/);
  assert.match(mobileHeader, /<ExternalLink className="h-4 w-4"/);
  assert.ok(mobileHeader.indexOf('aria-label="Abrir página pública"') < mobileHeader.indexOf("AdminNotificationBell"));
});

test("negócio inativo mantém o indicador sem criar link público", () => {
  assert.match(mobileHeader, /business\.active \? <Link[\s\S]*: <span[^>]*>Inativo<\/span>/);
});

test("identidade desktop continua exibindo o nome do negócio", () => {
  assert.match(desktopAside, /<span className="truncate font-semibold">\{business\.name\}<\/span>/);
});
