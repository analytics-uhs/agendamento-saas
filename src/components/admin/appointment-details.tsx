"use client";

import { Ban, CheckCircle2, Repeat2, UserX } from "lucide-react";
import { AppointmentWhatsappReminder } from "@/components/admin/appointment-whatsapp-reminder";
import { Button } from "@/components/ui/button";
import { appointmentSourceLabels } from "@/lib/appointments";
import {
  formatDateTime,
  formatDuration,
  formatLongDate,
  formatNumericDate,
} from "@/lib/date";
import { recurrenceWeekday } from "@/lib/recurrence";
import type { AdminAppointment } from "@/types/appointments";
import type { AppointmentStatus } from "@/types/database";

const statusActions: {
  status: "completed" | "no_show" | "cancelled";
  label: string;
  Icon: typeof Ban;
  variant?: "danger";
}[] = [
  { status: "completed", label: "Concluir", Icon: CheckCircle2 },
  { status: "no_show", label: "Não compareceu", Icon: UserX },
  { status: "cancelled", label: "Cancelar", Icon: Ban, variant: "danger" },
];

export function AppointmentDetails({
  appointment,
  saving,
  cancelling,
  onStatus,
  onCancelScope,
  onCancelClose,
  onReminderSent,
}: {
  appointment: AdminAppointment;
  saving: boolean;
  cancelling: boolean;
  onStatus: (status: AppointmentStatus) => void;
  onCancelScope: (scope: "single" | "future") => void;
  onCancelClose: () => void;
  onReminderSent: (reminderSentAt: string) => void;
}) {
  return (
    <div className="step-in border-t bg-surface/50 p-4">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted">Cliente</dt>
          <dd className="font-medium">{appointment.customerName}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">WhatsApp</dt>
          <dd className="font-medium">{appointment.customerWhatsapp}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Data e horário</dt>
          <dd className="font-medium capitalize">
            {formatLongDate(appointment.appointmentDate)} ·{" "}
            {appointment.startTime}–{appointment.endTime}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Duração</dt>
          <dd className="font-medium">
            {formatDuration(appointment.durationMinutes)}
          </dd>
        </div>
        {appointment.group1 ? (
          <div>
            <dt className="text-xs text-muted">{appointment.group1.label}</dt>
            <dd className="font-medium">{appointment.group1.name}</dd>
          </div>
        ) : null}
        {appointment.group2 ? (
          <div>
            <dt className="text-xs text-muted">{appointment.group2.label}</dt>
            <dd className="font-medium">{appointment.group2.name}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-xs text-muted">Origem</dt>
          <dd className="font-medium">
            {appointmentSourceLabels[appointment.source]}
          </dd>
        </div>
        {appointment.series ? (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 sm:col-span-2">
            <dt className="flex items-center gap-2 text-xs font-semibold text-primary">
              <Repeat2 className="h-3.5 w-3.5" />
              Recorrente
            </dt>
            <dd className="mt-1 text-sm">
              Toda {recurrenceWeekday(appointment.series.startsOn)} às{" "}
              {appointment.series.startTime} · primeira data{" "}
              {formatNumericDate(appointment.series.startsOn)} ·{" "}
              {appointment.series.repeatCount === null
                ? "Permanente"
                : `${appointment.series.repeatCount} repetições · ocorrência ${appointment.series.occurrenceNumber} de ${appointment.series.repeatCount}`}
            </dd>
          </div>
        ) : null}
        {appointment.reminderSentAt ? (
          <div>
            <dt className="text-xs text-muted">Último lembrete</dt>
            <dd className="font-medium">
              Lembrete enviado em {formatDateTime(appointment.reminderSentAt)}
            </dd>
          </div>
        ) : null}
      </dl>
      {cancelling ? (
        <div className="mt-4 rounded-xl border border-danger/25 bg-danger/5 p-3">
          <p className="text-sm font-semibold">Como deseja cancelar?</p>
          <p className="mt-1 text-xs text-muted">
            O histórico anterior não será alterado.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="danger"
              disabled={saving}
              onClick={() => onCancelScope("single")}
            >
              Cancelar somente este
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={saving}
              onClick={() => onCancelScope("future")}
            >
              Cancelar este e os próximos
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={saving}
              onClick={onCancelClose}
            >
              Voltar
            </Button>
          </div>
        </div>
      ) : null}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <AppointmentWhatsappReminder
          appointment={appointment}
          variant="full"
          onReminderSent={onReminderSent}
        />
        <div className="flex flex-wrap items-center justify-end gap-2 sm:ml-auto">
          {appointment.status === "scheduled"
            ? statusActions.map(({ status, label, Icon, variant }) => (
                <Button
                  key={status}
                  disabled={saving}
                  variant={variant ?? "ghost"}
                  size="sm"
                  onClick={() => onStatus(status)}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </Button>
              ))
            : null}
        </div>
      </div>
    </div>
  );
}
