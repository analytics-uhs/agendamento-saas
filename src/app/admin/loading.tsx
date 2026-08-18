export default function AdminLoading() {
  return <div className="animate-pulse space-y-5" aria-label="Carregando configurações">
    <div className="h-7 w-52 rounded-lg bg-border" />
    <div className="h-4 w-80 max-w-full rounded bg-border" />
    <div className="h-64 rounded-xl border bg-background" />
  </div>;
}
