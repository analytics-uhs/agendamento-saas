import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(join(process.cwd(), "src/components/admin/admin-notification-center.tsx"), "utf8");

test("sino alterna o estado aberto e preserva aria-expanded", () => {
  assert.match(source, /aria-expanded=\{center\.open\}/);
  assert.match(source, /onClick=\{\(\) => center\.setOpen\(\(current\) => !current\)\}/);
});

test("listeners de clique externo e Escape existem somente enquanto aberto e possuem cleanup", () => {
  assert.match(source, /if \(!open\) return;/);
  assert.match(source, /document\.addEventListener\("pointerdown", closeOnOutsidePointer\)/);
  assert.match(source, /document\.addEventListener\("keydown", closeOnEscape\)/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /document\.removeEventListener\("pointerdown", closeOnOutsidePointer\)/);
  assert.match(source, /document\.removeEventListener\("keydown", closeOnEscape\)/);
});

test("sino e painel compartilham containers desktop/mobile para preservar cliques internos", () => {
  assert.match(source, /desktopContainerRef/);
  assert.match(source, /mobileContainerRef/);
  assert.match(source, /isOutsideAdminNotificationPopover/);
});
