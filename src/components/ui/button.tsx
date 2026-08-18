import type { ButtonHTMLAttributes } from "react";
import { classes } from "@/lib/classes";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "outline" | "ghost" | "danger"; size?: "sm" | "md" | "icon" };

export function Button({ className, variant = "primary", size = "md", type = "button", ...props }: Props) {
  return <button type={type} className={classes(
    "focus-ring inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45",
    size === "sm" && "h-9 px-3 text-sm", size === "md" && "h-11 px-4 text-sm", size === "icon" && "h-10 w-10",
    variant === "primary" && "bg-primary text-white hover:bg-primary/90",
    variant === "outline" && "border bg-card text-foreground hover:bg-surface",
    variant === "ghost" && "text-muted hover:bg-surface hover:text-foreground",
    variant === "danger" && "border border-danger/25 bg-danger/10 text-danger hover:bg-danger/15",
    className,
  )} {...props} />;
}
