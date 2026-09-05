import { Boxes, CalendarDays, Clock3, Home, Package, Palette, ReceiptText, Settings2, ShieldCheck, ShoppingCart, Store, type LucideIcon } from "lucide-react";
import { filterModuleNavigation, type BusinessModule, type BusinessModules } from "./business-modules";

type AdminNavigationItem = {
  href: string;
  label: string;
  Icon: LucideIcon;
  exact?: boolean;
  requiredModule?: BusinessModule;
};

export const adminNavigationItems: readonly AdminNavigationItem[] = [
  { href: "/admin", label: "Início", Icon: Home, exact: true, requiredModule: "scheduling" },
  { href: "/admin/agenda", label: "Agenda", Icon: CalendarDays, requiredModule: "scheduling" },
  { href: "/admin/configuracao", label: "Configuração", Icon: Settings2, requiredModule: "scheduling" },
  { href: "/admin/horarios", label: "Horários", Icon: Clock3, requiredModule: "scheduling" },
  { href: "/admin/produtos", label: "Produtos", Icon: Package, requiredModule: "management" },
  { href: "/admin/estoque", label: "Estoque", Icon: Boxes, requiredModule: "management" },
  { href: "/admin/compras", label: "Compras", Icon: ShoppingCart, requiredModule: "management" },
  { href: "/admin/vendas", label: "Vendas", Icon: ReceiptText, requiredModule: "management" },
  { href: "/admin/pdv", label: "PDV", Icon: Store, requiredModule: "management" },
  { href: "/admin/financeiro", label: "Financeiro", Icon: ReceiptText, requiredModule: "management" },
  { href: "/admin/fiscal", label: "Fiscal", Icon: ReceiptText, requiredModule: "fiscal" },
  { href: "/admin/aparencia", label: "Aparência", Icon: Palette },
  { href: "/admin/negocio", label: "Meu negócio", Icon: Store },
];

export function getAdminNavigation(modules: BusinessModules, platformAdmin: boolean): AdminNavigationItem[] {
  const items = filterModuleNavigation(adminNavigationItems, modules);
  return platformAdmin ? [...items, { href: "/super-admin", label: "Super Admin", Icon: ShieldCheck, exact: false }] : items;
}
