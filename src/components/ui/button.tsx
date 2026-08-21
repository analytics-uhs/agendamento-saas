import type { ButtonHTMLAttributes } from "react";
import { classes } from "@/lib/classes";

export type ButtonVariant = "primary" | "outline" | "ghost" | "success" | "warning" | "danger";
type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" | "md" | "icon" };

export function Button({ className, variant = "primary", size = "md", type = "button", ...props }: Props) {
  return <button type={type} className={classes(
    "focus-ring inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45",
    size === "sm" && "h-9 px-3 text-sm", size === "md" && "h-11 px-4 text-sm", size === "icon" && "h-10 w-10",
    variant === "primary" && "bg-primary text-white hover:bg-primary/90",
    variant === "outline" && "border bg-card text-foreground hover:bg-surface",
    variant === "ghost" && "text-muted hover:bg-surface hover:text-foreground",
    variant === "success" && "border border-success/30 bg-success/10 text-success hover:bg-success/15",
    variant === "warning" && "border border-accent/45 bg-accent/15 text-foreground hover:bg-accent/25",
    variant === "danger" && "border border-danger/25 bg-danger/10 text-danger hover:bg-danger/15",
    className,
  )} {...props} />;
}
