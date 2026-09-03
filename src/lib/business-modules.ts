export const BUSINESS_MODULES = ["scheduling", "management", "fiscal"] as const;
export type BusinessModule = typeof BUSINESS_MODULES[number];
export type BusinessModules = Readonly<Record<BusinessModule, boolean>>;

export function isBusinessModule(value: unknown): value is BusinessModule {
  return BUSINESS_MODULES.some((module) => module === value);
}

/** Missing permissions fail closed; database initialization owns the defaults. */
export function parseBusinessModules(rows: readonly { module: unknown; enabled: unknown }[]): BusinessModules {
  const modules = { scheduling: false, management: false, fiscal: false };
  const seen = new Set<BusinessModule>();
  for (const row of rows) {
    if (!isBusinessModule(row.module) || typeof row.enabled !== "boolean" || seen.has(row.module)) {
      throw new Error("Configuração de módulos inválida.");
    }
    seen.add(row.module);
    modules[row.module] = row.enabled;
  }
  return modules;
}

export function businessHasModule(modules: BusinessModules, module: BusinessModule): boolean {
  return isBusinessModule(module) && modules[module] === true;
}

export function filterModuleNavigation<T extends { requiredModule?: BusinessModule }>(items: readonly T[], modules: BusinessModules): T[] {
  return items.filter((item) => !item.requiredModule || businessHasModule(modules, item.requiredModule));
}
