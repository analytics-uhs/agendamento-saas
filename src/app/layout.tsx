import type { Metadata, Viewport } from "next";
import { MockAppProvider } from "@/components/mock-app-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "AgendaFácil", template: "%s — AgendaFácil" },
  description: "Agendamentos online simples para o seu negócio.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#181818" },
  ],
};

const themeScript = `
  try {
    const theme = localStorage.getItem('agenda-theme') || 'system';
    const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.dataset.theme = theme;
  } catch (_) {}
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body><MockAppProvider>{children}</MockAppProvider></body>
    </html>
  );
}
