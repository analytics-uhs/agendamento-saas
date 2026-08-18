export function PageHeading({ title, description }: { title: string; description?: string }) {
  return <header><h1 className="text-2xl font-semibold tracking-tight">{title}</h1>{description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}</header>;
}
