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
  themeColor: "#FFFFFF",
};

const themeScript = `
  try {
    const theme = localStorage.getItem('agenda-theme') === 'dark' ? 'dark' : 'light';
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('agenda-theme', theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#181818' : '#FFFFFF');
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
