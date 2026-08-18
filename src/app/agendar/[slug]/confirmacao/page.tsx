import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { formatDuration, formatLongDate, todayISO } from "@/lib/date";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const value = (field: string | string[] | undefined, fallback: string) => typeof field === "string" ? field : fallback;

export default async function ConfirmationPage({ params, searchParams }: Props) {
  const { slug } = await params, query = await searchParams;
  const date = value(query.date, todayISO()), time = value(query.time, "09:00"), duration = Number(value(query.duration, "30"));
  return <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-10"><div className="w-full max-w-md rounded-2xl border bg-card p-6 text-center">
    <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary text-white"><CheckCircle2 className="h-7 w-7" /></span><h1 className="mt-4 text-xl font-semibold">Agendamento confirmado!</h1><p className="mt-1 text-sm text-muted">Seu horário foi reservado neste protótipo.</p>
    <dl className="mt-6 space-y-3 rounded-xl border p-4 text-left text-sm">
      {value(query.group1, "") ? <div className="flex justify-between gap-3"><dt className="text-muted">Grupo 1</dt><dd className="font-medium">{value(query.group1, "—")}</dd></div> : null}
      {value(query.group2, "") ? <div className="flex justify-between gap-3"><dt className="text-muted">Grupo 2</dt><dd className="font-medium">{value(query.group2, "—")}</dd></div> : null}
      <div className="flex justify-between gap-3"><dt className="text-muted">Data</dt><dd className="font-medium capitalize">{formatLongDate(date)}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted">Horário</dt><dd className="font-medium">{time}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted">Duração</dt><dd className="font-medium">{formatDuration(duration)}</dd></div>
    </dl><Link href={`/agendar/${slug}`} className="focus-ring mt-6 flex h-11 w-full items-center justify-center rounded-xl border bg-card text-sm font-semibold hover:bg-surface">Fazer novo agendamento</Link>
  </div></main>;
}
