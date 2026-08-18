"use client";

import { Moon, Sun } from "lucide-react";
import { classes } from "@/lib/classes";
import type { VisualThemePreference } from "@/types/business";

export function ThemePreferenceToggle({ value, onChange, compact = false }: { value: VisualThemePreference; onChange: (value: VisualThemePreference) => void; compact?: boolean }) {
  const next = value === "dark" ? "light" : "dark";
  const Icon = value === "dark" ? Sun : Moon;
  return <button type="button" title={next === "dark" ? "Ativar tema escuro" : "Ativar tema claro"} aria-label={next === "dark" ? "Ativar tema escuro" : "Ativar tema claro"} onClick={() => onChange(next)} className={classes("focus-ring inline-flex items-center justify-center rounded-xl border bg-card text-muted transition-colors hover:bg-surface hover:text-foreground", compact ? "h-9 w-9" : "h-11 w-11")}><Icon className={compact ? "h-4 w-4" : "h-5 w-5"} /></button>;
}

