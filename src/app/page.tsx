import type { Metadata } from "next";
import { MarketingLanding } from "@/components/marketing/marketing-landing";
import { getPublicFounderOffer } from "@/lib/repositories/founder-offer";

const title = "AgendaFácil — Seus clientes agendam. Seu dia continua.";
const description = "Disponibilize seus horários 24 horas por dia e deixe seus clientes agendarem sozinhos, sem depender de respostas manuais.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  openGraph: { type: "website", locale: "pt_BR", siteName: "AgendaFácil", title, description },
  twitter: { card: "summary_large_image", title, description },
};

export default async function MarketingPage() {
  const founderOffer = await getPublicFounderOffer();
  return <MarketingLanding founderOffer={founderOffer} />;
}
