"use client";

import { useSyncExternalStore } from "react";
import { appearanceStyle } from "@/lib/appearance";
import type { VisualThemePreference } from "@/types/business";
import type { Palette } from "@/types/scheduling";

function subscribe(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

function currentTheme(): VisualThemePreference {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function BusinessAppearance({ children, palette, initialTheme }: { children: React.ReactNode; palette: Palette; initialTheme: VisualThemePreference }) {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => initialTheme);
  return <div style={appearanceStyle(palette, theme)} data-theme={theme}>{children}</div>;
}
