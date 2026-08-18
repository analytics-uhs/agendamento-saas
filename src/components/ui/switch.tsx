import { classes } from "@/lib/classes";

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={classes("focus-ring relative h-6 w-11 shrink-0 rounded-full transition-colors", checked ? "bg-primary" : "bg-border")}>
    <span className={classes("absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform", checked && "translate-x-5")} />
  </button>;
}
