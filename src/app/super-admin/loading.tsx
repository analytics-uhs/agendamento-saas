export default function SuperAdminLoading() {
  return <div className="animate-pulse space-y-5" aria-label="Carregando Super Admin">
    <div className="h-7 w-52 rounded-lg bg-border" />
    <div className="h-4 w-80 max-w-full rounded bg-border" />
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-28 rounded-xl border bg-background" />)}</div>
  </div>;
}

