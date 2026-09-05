import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as modulesApi from "./business-modules";
import { adminNavigationItems, getAdminNavigation } from "./admin-navigation-items";

const defaults = { scheduling: true, management: false, fiscal: false };

test("module parser accepts only known boolean permissions and fails closed on missing rows", () => {
  for (const moduleName of modulesApi.BUSINESS_MODULES) assert.ok(modulesApi.isBusinessModule(moduleName));
  for (const value of [null, undefined, "ERP", "constructor", 1]) assert.equal(modulesApi.isBusinessModule(value), false);
  assert.deepEqual(modulesApi.parseBusinessModules(Object.entries(defaults).map(([module, enabled]) => ({ module, enabled }))), defaults);
  assert.deepEqual(modulesApi.parseBusinessModules([]), { scheduling: false, management: false, fiscal: false });
  assert.throws(() => modulesApi.parseBusinessModules([{ module: "unknown", enabled: true }]));
  assert.throws(() => modulesApi.parseBusinessModules([{ module: "management", enabled: "true" }]));
  assert.throws(() => modulesApi.parseBusinessModules([{ module: "fiscal", enabled: true }, { module: "fiscal", enabled: false }]));
});

test("module checks and shared navigation retain all current items with defaults", () => {
  assert.equal(modulesApi.businessHasModule(defaults, "scheduling"), true);
  assert.equal(modulesApi.businessHasModule(defaults, "management"), false);
  assert.equal(modulesApi.businessHasModule(defaults, "fiscal"), false);
  assert.deepEqual(getAdminNavigation(defaults, false), adminNavigationItems.filter((item) => item.requiredModule !== "management" && item.requiredModule !== "fiscal"));
  assert.ok(!getAdminNavigation(defaults, false).some((item) => item.href === "/admin/fiscal"));
  assert.ok(getAdminNavigation({ ...defaults, fiscal: true }, false).some((item) => item.href === "/admin/fiscal"));
  assert.ok(!getAdminNavigation(defaults, false).some((item) => item.href === "/admin/produtos"));
  assert.ok(getAdminNavigation({ ...defaults, management: true }, false).some((item) => item.href === "/admin/produtos"));
  assert.equal(getAdminNavigation(defaults, true).at(-1)?.href, "/super-admin");
  const future = [{ label: "Base" }, { label: "Gestão", requiredModule: "management" as const }];
  assert.deepEqual(modulesApi.filterModuleNavigation(future, defaults), [future[0]]);
  assert.deepEqual(modulesApi.filterModuleNavigation(future, { ...defaults, management: true }), future);
  assert.equal(modulesApi.businessHasModule({ ...defaults, fiscal: true }, "fiscal"), true);
});

// Execute the real server modules, replacing only framework/network boundaries.
function loadServerModule(path: string, dependencies: Record<string, unknown>) {
  const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports: Record<string, (...args: never[]) => Promise<unknown>> = {};
  runInNewContext(code, { exports, require: (id: string) => {
    if (id === "server-only") return {};
    if (!(id in dependencies)) throw new Error(`Unexpected import: ${id}`);
    return dependencies[id];
  } });
  return exports;
}

test("real route guard resolves current tenant, allows scheduling and denies inactive modules", async () => {
  const business = { id: "tenant-session" };
  const calls: string[] = [];
  const guard = loadServerModule("src/lib/auth/business-module.ts", {
    "next/navigation": { notFound: () => { throw new Error("NOT_FOUND"); } },
    "@/lib/business-modules": modulesApi,
    "@/lib/repositories/businesses": { requireCurrentBusiness: async () => business },
    "@/lib/repositories/business-modules": { getBusinessModules: async (id: string) => { calls.push(id); return defaults; } },
  });
  assert.equal(await guard.requireBusinessModule("scheduling" as never), business);
  await assert.rejects(guard.requireBusinessModule("management" as never), /NOT_FOUND/);
  await assert.rejects(guard.requireBusinessModule("fiscal" as never), /NOT_FOUND/);
  assert.deepEqual(calls, [business.id, business.id, business.id]);
});

test("repository uses authenticated client, restricts tenant and propagates read failures", async () => {
  const calls: unknown[] = [];
  let error: unknown = null;
  const repository = loadServerModule("src/lib/repositories/business-modules.ts", {
    "@/lib/business-modules": modulesApi,
    "@/lib/supabase/server": { createClient: async () => ({ from: (table: string) => {
      calls.push(table);
      return { select: (fields: string) => { calls.push(fields); return { eq: async (key: string, id: string) => {
        calls.push([key, id]);
        return { data: [{ module: "scheduling", enabled: true }], error };
      } }; } };
    } }) },
  });
  assert.deepEqual(await repository.getBusinessModules("tenant-session" as never), defaults);
  assert.deepEqual(calls, ["business_modules", "module, enabled", ["business_id", "tenant-session"]]);
  error = { message: "network failure" };
  await assert.rejects(repository.getBusinessModules("tenant-session" as never), /Não foi possível carregar/);
});
