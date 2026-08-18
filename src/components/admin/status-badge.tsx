import type { AppointmentStatus } from "@/types/database";
import { classes } from "@/lib/classes";
import { appointmentStatusLabels } from "@/lib/appointments";

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  return <span className={classes("inline-flex rounded-full px-2 py-1 text-[11px] font-semibold", status === "scheduled" && "bg-primary/10 text-primary", status === "completed" && "bg-success/10 text-success", (status === "cancelled" || status === "no_show") && "bg-danger/10 text-danger")}>{appointmentStatusLabels[status]}</span>;
}
