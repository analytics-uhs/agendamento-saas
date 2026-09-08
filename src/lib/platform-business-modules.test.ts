import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Switch } from "../components/ui/switch";
import * as modulesApi from "./business-modules";
import { validCatalogId } from "./product-catalog";
import { getAdminNavigation } from "./admin-navigation-items";
import type { ActionResult } from "../types/business";

function load<T>(path: string, dependencies: Record<string, unknown>): T {
  const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  runInNewContext(code, { exports, require: (id: string) => {
    if (id === "server-only") return {};
    if (!(id in dependencies)) throw Error(`Unexpected dependency ${id}`);
    return dependencies[id];
  } });
  return exports as T;
}
const businessId = "be680000-0000-4000-8000-000000000001";

test("platform module repository guards every call, validates inputs and uses only session RPCs", async () => {
  let allowed = true;
  let guarded = 0;
  let fail = false;
  const calls: unknown[] = [];
  const repo = load<{
    getPlatformBusinessModules(id: string): Promise<modulesApi.BusinessModules>;
    setPlatformBusinessModule(id: string, module: unknown, enabled: unknown): Promise<unknown>;
  }>("src/lib/repositories/platform-business-modules.ts", {
    "@/lib/auth/platform-admin": { requirePlatformAdmin: async () => { guarded++; if (!allowed) throw Error("DENIED"); } },
    "@/lib/business-modules": modulesApi,
    "@/lib/product-catalog": { validCatalogId },
    "@/lib/supabase/server": { createClient: async () => ({ rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push([name, args]);
      return { error: fail ? { message: "private database message" } : null, data: name === "get_platform_business_modules" ? [] : {
        business_id: args.p_business_id, business_name: "Arena", module: args.p_module, enabled: args.p_enabled,
      } };
    } }) },
  });
  assert.deepEqual(await repo.getPlatformBusinessModules(businessId), { scheduling: false, management: false, fiscal: false });
  await repo.setPlatformBusinessModule(businessId, "management", true);
  assert.equal(JSON.stringify(calls[1]), JSON.stringify(["set_platform_business_module_enabled", { p_business_id: businessId, p_module: "management", p_enabled: true }]));
  for (const [id, module, enabled] of [["bad", "management", true], [businessId, "unknown", true], [businessId, "fiscal", "true"], [businessId, "scheduling", false]] as const) {
    await assert.rejects(repo.setPlatformBusinessModule(id, module, enabled));
  }
  assert.equal(calls.length, 2);
  allowed = false;
  await assert.rejects(repo.setPlatformBusinessModule(businessId, "fiscal", true), /DENIED/);
  await assert.rejects(repo.getPlatformBusinessModules(businessId), /DENIED/);
  assert.equal(calls.length, 2);
  assert.equal(guarded, 8);
  allowed = true; fail = true;
  await assert.rejects(repo.setPlatformBusinessModule(businessId, "fiscal", true), /Não foi possível atualizar/);
});

test("module action revalidates detail/Admin layout and sanitizes errors", async () => {
  const paths: unknown[] = [];
  let failure = false;
  const actions = load<{ changePlatformBusinessModule(id: string, module: string, enabled: boolean): Promise<ActionResult> }>("src/app/super-admin/actions.ts", {
    "next/cache": { revalidatePath: (...args: unknown[]) => paths.push(args) },
    "@/lib/auth/platform-admin": {}, "@/lib/repositories/super-admin": {},
    "@/lib/repositories/platform-business-modules": { setPlatformBusinessModule: async (_id: string, module: string, enabled: boolean) => {
      if (failure) throw Error("secret SQL detail");
      return { businessName: "Arena", module, enabled };
    } },
  });
  assert.equal((await actions.changePlatformBusinessModule(businessId, "management", true)).message, "Gestão habilitada para Arena.");
  assert.deepEqual(paths, [[`/super-admin/negocios/${businessId}`], ["/admin", "layout"]]);
  failure = true;
  const result = await actions.changePlatformBusinessModule(businessId, "fiscal", true);
  assert.equal(result.ok, false); assert.doesNotMatch(result.message, /secret|SQL/);
  assert.equal(paths.length, 2);
});

test("existing navigation reflects module enable/disable on the next read, independently", () => {
  const initial = { scheduling: true, management: false, fiscal: false };
  const enabled = modulesApi.parseBusinessModules([{ module: "scheduling", enabled: true }, { module: "management", enabled: true }]);
  for (const href of ["/admin/copa", "/admin/produtos", "/admin/estoque", "/admin/compras", "/admin/financeiro"]) {
    assert.ok(getAdminNavigation(enabled, false).some((item) => item.href === href));
    assert.ok(!getAdminNavigation(initial, false).some((item) => item.href === href));
  }
  assert.ok(!getAdminNavigation(enabled, false).some((item) => item.href === "/admin/fiscal"));
  assert.ok(getAdminNavigation({ ...initial, fiscal: true }, false).some((item) => item.href === "/admin/fiscal"));
});

test("module section renders shared switches, locked Agenda, and truthful missing states", () => {
  const { BusinessModulesControl } = load<{ BusinessModulesControl: React.ComponentType<{ businessId: string; modules: modulesApi.BusinessModules }> }>("src/components/super-admin/business-modules-control.tsx", {
    react: React, "react/jsx-runtime": jsx, "next/navigation": { useRouter: () => ({ refresh() {} }) },
    "@/app/super-admin/actions": {}, "@/components/ui/card": { Card }, "@/components/ui/button": { Button },
    "@/components/ui/switch": { Switch }, "@/lib/business-modules": modulesApi,
  });
  const render = (modules: modulesApi.BusinessModules) => renderToStaticMarkup(React.createElement(BusinessModulesControl, { businessId, modules }));
  const html = render({ scheduling: true, management: false, fiscal: false });
  assert.equal((html.match(/role="switch"/g) ?? []).length, 3);
  assert.equal((html.match(/<fieldset disabled=""/g) ?? []).length, 1);
  assert.match(html, /não pode ser desligada/);
  assert.match(html, /sem apagar seus dados/);
  assert.doesNotMatch(render({ scheduling: false, management: false, fiscal: false }), /<fieldset disabled=""/);
});
