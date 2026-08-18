"use client";

import { useEffect, useState } from "react";
import { ThemePreferenceToggle } from "@/components/theme/theme-preference-toggle";
import type { VisualThemePreference } from "@/types/business";

function applyTheme(theme: VisualThemePreference) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("agenda-theme", theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#181818" : "#FFFFFF");
}

export function ThemeControl({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<VisualThemePreference>("light");
  useEffect(() => {
    const saved = localStorage.getItem("agenda-theme") === "dark" ? "dark" : "light";
    const frame = window.requestAnimationFrame(() => { setTheme(saved); applyTheme(saved); });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  return <ThemePreferenceToggle compact={compact} value={theme} onChange={(next) => { setTheme(next); applyTheme(next); }} />;
}
