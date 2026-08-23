import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  const heading = (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
    </div>
  );

  return action ? (
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      {heading}
      {action}
    </header>
  ) : (
    <header>{heading}</header>
  );
}
