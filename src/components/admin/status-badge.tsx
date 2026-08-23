import type { AppointmentStatus } from "@/types/database";
import { appointmentStatusLabels } from "@/lib/appointments";
import { Badge, type BadgeVariant } from "@/components/ui/badge";

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  const variants: Record<AppointmentStatus, BadgeVariant> = {
    scheduled: "primary",
    completed: "success",
    cancelled: "danger",
    no_show: "danger",
  };

  return <Badge variant={variants[status]} size="sm">{appointmentStatusLabels[status]}</Badge>;
}
