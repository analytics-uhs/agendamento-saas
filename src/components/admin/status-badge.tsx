import type { AppointmentStatus } from "@/types/scheduling";
import { classes } from "@/lib/classes";

const labels: Record<AppointmentStatus, string> = { scheduled: "Agendado", done: "Concluído", canceled: "Cancelado", "no-show": "Não compareceu" };
export function StatusBadge({ status }: { status: AppointmentStatus }) {
  return <span className={classes("inline-flex rounded-full px-2 py-1 text-[11px] font-semibold", status === "scheduled" && "bg-primary/10 text-primary", status === "done" && "bg-success/10 text-success", (status === "canceled" || status === "no-show") && "bg-danger/10 text-danger")}>{labels[status]}</span>;
}
