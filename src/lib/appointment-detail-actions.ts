import type { ButtonVariant } from "@/components/ui/button";
import type { AppointmentStatus } from "@/types/database";

export type AppointmentDetailAction = {
  id: "edit" | "completed" | "no_show" | "cancelled";
  label: string;
  status: AppointmentStatus | null;
  variant: ButtonVariant;
};

export const appointmentDetailActions: AppointmentDetailAction[] = [
  { id: "edit", label: "Editar", status: null, variant: "outline" },
  { id: "completed", label: "Concluir", status: "completed", variant: "success" },
  { id: "no_show", label: "Não compareceu", status: "no_show", variant: "warning" },
  { id: "cancelled", label: "Cancelar", status: "cancelled", variant: "danger" },
];
