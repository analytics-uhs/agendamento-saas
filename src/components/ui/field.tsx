import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";
import { classes } from "@/lib/classes";

export function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return <label htmlFor={htmlFor} className="text-sm font-medium">{children}</label>;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={classes("focus-ring h-11 w-full rounded-xl border bg-card px-3 text-sm text-foreground placeholder:text-muted disabled:opacity-50", className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={classes("focus-ring h-11 w-full rounded-xl border bg-card px-3 text-sm text-foreground", className)} {...props} />;
}
