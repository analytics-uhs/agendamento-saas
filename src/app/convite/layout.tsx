import type { Metadata } from "next";
export const metadata: Metadata = { title: "Seu acesso | AgendaFácil", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";
export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex min-h-dvh max-w-lg items-center px-5 py-10"><section className="w-full rounded-xl border bg-background p-6">{children}</section></main>;
}
