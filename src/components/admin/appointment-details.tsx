"use client";

import { Ban, CheckCircle2, Pencil, Repeat2, RotateCcw, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { appointmentDetailActions } from "@/lib/appointment-detail-actions";
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
import { StatusBadge } from "@/components/admin/status-badge";

const actionIcons = { edit: Pencil, completed: CheckCircle2, no_show: UserX, cancelled: Ban };

export function AppointmentDetails({
  appointment,
  saving,
  cancelling,
  onStatus,
  onCancelScope,
  onCancelClose,
  onEdit,
  onCancelComplementary,
  onCancelComplete,
}: {
  appointment: AdminAppointment;
  saving: boolean;
  cancelling: boolean;
  onStatus: (status: AppointmentStatus) => void;
  onCancelScope: (scope: "single" | "future") => void;
  onCancelClose: () => void;
  onEdit?: () => void;
  onCancelComplementary?: () => void;
  onCancelComplete?: () => void;
}) {
  return (
    <div className="step-in border-t bg-surface/50 p-4">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted">Status</dt>
          <dd className="mt-1"><StatusBadge status={appointment.status} /></dd>
        </div>
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
        {appointment.complementary ? <div className="rounded-xl border border-accent/30 bg-accent/10 p-3 sm:col-span-2"><dt className="text-xs font-semibold">Complementar · {appointment.complementary.groupName}</dt><dd className="mt-1 font-medium">{appointment.complementary.optionName}</dd><dd className="mt-0.5 text-xs text-muted">{appointment.complementary.occupancyMode === "day" ? "Reserva do dia" : `${appointment.complementary.startTime}–${appointment.complementary.endTime}`}</dd></div> : null}
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
      {appointment.status === "scheduled" ? (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {appointmentDetailActions.map((action) => {
            const Icon = actionIcons[action.id];
            return (
              <Button
                key={action.id}
                disabled={saving || (action.id === "edit" && !onEdit)}
                variant={action.variant}
                size="sm"
                className="w-full px-2"
                onClick={() => action.status ? onStatus(action.status) : onEdit?.()}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{action.label}</span>
              </Button>
            );
          })}
        </div>
      ) : (
        <div className="mt-4">
          <Button
            disabled={saving}
            size="sm"
            className="w-full sm:w-auto"
            onClick={() => onStatus("scheduled")}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Voltar para agendado
          </Button>
        </div>
      )}
      {appointment.complementary && appointment.complementary.status === "scheduled" ? (
        <div className="mt-4 rounded-xl border bg-background p-3">
          <p className="text-sm font-semibold">Ações da reserva combinada</p>
          <p className="mt-1 text-xs text-muted">Escolha o componente que deseja cancelar. O restante permanece ativo.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" size="sm" disabled={saving} onClick={onCancelComplementary}><Ban className="h-3.5 w-3.5"/>Cancelar {appointment.complementary.optionName}</Button>
            <Button variant="danger" size="sm" disabled={saving} onClick={onCancelComplete}><Ban className="h-3.5 w-3.5"/>Cancelar reserva completa</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
