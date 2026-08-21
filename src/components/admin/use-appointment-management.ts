"use client";

import { useState, useTransition } from "react";
import {
  cancelRecurringAppointment,
  changeAppointmentStatus,
} from "@/app/admin/agenda/actions";
import type { AdminAppointment } from "@/types/appointments";
import type { AppointmentStatus } from "@/types/database";

export function useAppointmentManagement(
  initialAppointments: AdminAppointment[],
  selectedDate: string,
) {
  const [appointments, setAppointments] = useState(initialAppointments);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [saving, startSavingTransition] = useTransition();
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  function updateStatus(
    appointment: AdminAppointment,
    status: AppointmentStatus,
  ) {
    if (status === "cancelled" && appointment.series) {
      setCancellingId(appointment.id);
      return;
    }
    if (
      status === "cancelled" &&
      !window.confirm(`Cancelar o agendamento de ${appointment.customerName}?`)
    )
      return;
    setFeedback(null);
    startSavingTransition(async () => {
      const result = await changeAppointmentStatus(
        appointment.id,
        status,
        selectedDate,
      );
      if (!result.ok) {
        setFeedback({ ok: false, message: result.message });
        return;
      }
      setAppointments(result.data);
      setFeedback({ ok: true, message: result.message });
    });
  }

  function cancelSeriesOccurrence(
    appointment: AdminAppointment,
    scope: "single" | "future",
  ) {
    setFeedback(null);
    startSavingTransition(async () => {
      const result = await cancelRecurringAppointment(
        appointment.id,
        scope,
        selectedDate,
      );
      if (!result.ok) setFeedback({ ok: false, message: result.message });
      else {
        setAppointments(result.data);
        setFeedback({ ok: true, message: result.message });
        setCancellingId(null);
      }
    });
  }

  function updateReminder(appointmentId: string, reminderSentAt: string) {
    setAppointments((current) =>
      current.map((appointment) =>
        appointment.id === appointmentId
          ? { ...appointment, reminderSentAt }
          : appointment,
      ),
    );
  }

  return {
    appointments,
    setAppointments,
    selectedId,
    setSelectedId,
    feedback,
    setFeedback,
    saving,
    startSavingTransition,
    cancellingId,
    setCancellingId,
    updateStatus,
    cancelSeriesOccurrence,
    updateReminder,
  };
}
