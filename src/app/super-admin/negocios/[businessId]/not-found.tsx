import Link from "next/link";

export default function BusinessNotFound() {
  return <div className="rounded-xl border bg-background p-8 text-center"><h1 className="text-xl font-semibold">Negócio não encontrado</h1><p className="mt-1 text-sm text-muted">Este estabelecimento não existe ou não está mais disponível.</p><Link href="/super-admin/negocios" className="focus-ring mt-5 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white">Voltar aos negócios</Link></div>;
}

