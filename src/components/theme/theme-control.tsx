"use client";

import { Laptop, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { classes } from "@/lib/classes";

type Theme = "light" | "dark" | "system";
const options = [{ id: "light" as const, label: "Claro", Icon: Sun }, { id: "dark" as const, label: "Escuro", Icon: Moon }, { id: "system" as const, label: "Sistema", Icon: Laptop }];

function applyTheme(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("agenda-theme", theme);
}

export function ThemeControl({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    const saved = (localStorage.getItem("agenda-theme") as Theme | null) ?? "system";
    const frame = window.requestAnimationFrame(() => setTheme(saved));
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => document.documentElement.dataset.theme === "system" && applyTheme("system");
    media.addEventListener("change", listener);
    return () => {
      window.cancelAnimationFrame(frame);
      media.removeEventListener("change", listener);
    };
  }, []);
  return <div className={classes("flex rounded-xl border bg-card p-1", compact && "border-0 bg-transparent p-0")} aria-label="Tema">
    {options.map(({ id, label, Icon }) => <button key={id} type="button" title={label} aria-label={`Tema ${label}`} onClick={() => { setTheme(id); applyTheme(id); }} className={classes("focus-ring flex items-center justify-center gap-1.5 rounded-lg text-xs font-medium", compact ? "h-8 w-8" : "h-8 flex-1 px-2", theme === id ? "bg-primary text-white" : "text-muted hover:bg-surface")}>
      <Icon className="h-3.5 w-3.5" />{compact ? null : label}
    </button>)}
  </div>;
}
