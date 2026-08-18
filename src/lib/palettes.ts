import type { Palette } from "@/types/scheduling";

export const palettes: Palette[] = [
  { id: "original", name: "Original", primary: "#E3613D", accent: "#F0BA40", background: "#FFFFFF", surface: "#F7F7F7", text: "#292929", muted: "#6B6B6B", border: "#E2E2E2" },
  { id: "midnight", name: "Midnight", primary: "#E3613D", accent: "#F0BA40", background: "#181818", surface: "#242424", text: "#F5F5F5", muted: "#AAAAAA", border: "#3A3A3A" },
  { id: "oceano", name: "Oceano", primary: "#2A7DE1", accent: "#4FC3C0", background: "#FFFFFF", surface: "#F4F8FC", text: "#1B2733", muted: "#65758B", border: "#DCE6F0" },
  { id: "floresta", name: "Floresta", primary: "#2E7D5B", accent: "#A8C66C", background: "#FFFFFF", surface: "#F4F9F5", text: "#1F2A24", muted: "#5F7168", border: "#DCE9DF" },
];

export function getPalette(id: string) {
  return palettes.find((palette) => palette.id === id) ?? palettes[0];
}
