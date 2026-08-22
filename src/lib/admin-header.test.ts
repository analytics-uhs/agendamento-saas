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

test("identidade desktop continua exibindo o nome do negócio", () => {
  assert.match(desktopAside, /<span className="truncate font-semibold">\{business\.name\}<\/span>/);
});
