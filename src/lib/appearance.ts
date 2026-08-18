import type { CSSProperties } from "react";
import type { VisualThemePreference } from "@/types/business";
import type { Palette } from "@/types/scheduling";

const darkSurface = {
  background: "#181818",
  surface: "#242424",
  text: "#F5F5F5",
  muted: "#AAAAAA",
  border: "#3A3A3A",
};

export function appearanceStyle(palette: Palette, theme: VisualThemePreference): CSSProperties {
  const colors = theme === "dark" ? { ...palette, ...darkSurface } : palette;
  return {
    "--primary": colors.primary,
    "--accent": colors.accent,
    "--background": colors.background,
    "--surface": colors.surface,
    "--foreground": colors.text,
    "--muted": colors.muted,
    "--border": colors.border,
    "--card": colors.background,
  } as CSSProperties;
}
