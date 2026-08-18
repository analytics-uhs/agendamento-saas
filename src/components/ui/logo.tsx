import { classes } from "@/lib/classes";

export function Logo({ name = "AgendaFácil", size = "md" }: { name?: string; size?: "sm" | "md" | "lg" }) {
  return <span aria-label={name} className={classes("grid shrink-0 place-items-center rounded-xl bg-primary font-bold text-white", size === "sm" && "h-8 w-8 text-xs", size === "md" && "h-10 w-10 text-sm", size === "lg" && "h-16 w-16 rounded-2xl text-xl")}>
    {name.split(/\s+/).map((word) => word[0]).join("").slice(0, 2).toUpperCase()}
  </span>;
}
