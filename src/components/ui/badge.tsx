import type { HTMLAttributes } from "react";
import { classes } from "@/lib/classes";

export type BadgeVariant = "neutral" | "primary" | "accent" | "success" | "danger";

export function Badge({
  variant = "neutral",
  size = "md",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
  size?: "compact" | "sm" | "md";
}) {
  return (
    <span
      className={classes(
        "inline-flex items-center rounded-full font-semibold",
        size === "compact" && "gap-1 px-2 py-1 text-[10px]",
        size === "sm" && "px-2 py-1 text-[11px]",
        size === "md" && "px-2.5 py-1 text-xs",
        variant === "neutral" && "bg-surface text-muted",
        variant === "primary" && "bg-primary/10 text-primary",
        variant === "accent" && "bg-accent/15 text-foreground",
        variant === "success" && "bg-success/10 text-success",
        variant === "danger" && "bg-danger/10 text-danger",
        className,
      )}
      {...props}
    />
  );
}
