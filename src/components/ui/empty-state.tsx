import type { HTMLAttributes } from "react";
import { classes } from "@/lib/classes";

export function EmptyState({
  size = "sm",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { size?: "sm" | "md" | "lg" }) {
  return (
    <div
      className={classes(
        "rounded-xl border border-dashed text-center text-sm text-muted",
        size === "sm" && "p-5",
        size === "md" && "p-6",
        size === "lg" && "p-8",
        className,
      )}
      {...props}
    />
  );
}
