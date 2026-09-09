import Link from "next/link";
import { requireCurrentBusiness } from "@/lib/repositories/businesses";
export default async function InviteReadyPage() {
  const business = await requireCurrentBusiness();
  return <div className="space-y-6"><h1 className="text-2xl font-semibold">{business.name}, seu negócio já está pronto 🎉</h1><p>Preparamos sua conta para você.</p><Link className="focus-ring flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 font-medium text-white" href="/admin">Acessar meu negócio</Link></div>;
}
