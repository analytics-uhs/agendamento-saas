import { classes } from "@/lib/classes";

export function BusinessStatusBadge({ active }: { active: boolean }) {
  return <span className={classes("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", active ? "bg-success/10 text-success" : "bg-danger/10 text-danger")}>{active ? "Ativo" : "Inativo"}</span>;
}

