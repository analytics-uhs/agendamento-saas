"use client";

import { BookingPayment } from "@/components/admin/booking-payment";
import { Ban, CalendarDays, Clock3, LoaderCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { cancelComplementaryReservation, cancelComplementarySeriesOccurrence } from "@/app/admin/agenda/actions";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { StatusBadge } from "@/components/admin/status-badge";
import { formatLongDate } from "@/lib/date";
import type { AdminComplementaryReservation, DailyCalendarData, RecurringCancellationScope } from "@/types/appointments";

export function ComplementaryReservationDetails({ reservation, onClose, onCancelled }: { reservation: AdminComplementaryReservation; onClose: () => void; onCancelled: (data: DailyCalendarData, message: string) => void }) {
  const [confirming, setConfirming] = useState(false); const [feedback, setFeedback] = useState<string | null>(null); const [saving, startTransition] = useTransition();
  const [scope, setScope] = useState<RecurringCancellationScope>("single");
  function cancel() { startTransition(async () => { const result = reservation.seriesId ? await cancelComplementarySeriesOccurrence(reservation.reservationId, reservation.reservationDate, scope) : await cancelComplementaryReservation(reservation.id, reservation.reservationDate); if (!result.ok) setFeedback(result.message); else onCancelled(result.data, result.message); }); }
  return <Modal title="Detalhes da reserva" onClose={onClose}><div className="space-y-5 p-4 sm:p-5"><dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-xs text-muted">Status</dt><dd className="mt-1"><StatusBadge status={reservation.status}/></dd></div><div><dt className="text-xs text-muted">Cliente</dt><dd className="mt-1 font-medium">{reservation.customerName}</dd></div><div><dt className="flex items-center gap-1.5 text-xs text-muted"><CalendarDays className="h-3.5 w-3.5"/>Data</dt><dd className="mt-1 font-medium capitalize">{formatLongDate(reservation.reservationDate)}</dd></div><div><dt className="flex items-center gap-1.5 text-xs text-muted"><Clock3 className="h-3.5 w-3.5"/>Período</dt><dd className="mt-1 font-medium">{reservation.occupancyMode === "day" ? "Reserva do dia" : `${reservation.startTime}–${reservation.endTime}`}</dd></div><div className="rounded-xl border border-accent/30 bg-accent/10 p-3 sm:col-span-2"><dt className="text-xs font-semibold">{reservation.groupName}</dt><dd className="mt-1 font-medium">{reservation.optionName}</dd></div></dl><BookingPayment target={{ type: "reservation", id: reservation.reservationId }} />{feedback ? <p role="status" className="rounded-xl border border-danger/25 bg-danger/10 p-3 text-sm text-danger">{feedback}</p> : null}{reservation.status === "scheduled" ? confirming ? <div className="rounded-xl border border-danger/25 bg-danger/5 p-4"><p className="text-sm font-semibold">Cancelar {reservation.optionName}?</p><p className="mt-1 text-xs text-muted">O histórico será preservado e o recurso ficará disponível novamente.</p>
      {reservation.seriesId ? <fieldset className="mt-4 space-y-2" disabled={saving}>
        <legend className="mb-2 text-sm font-medium">Quais reservas cancelar?</legend>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input type="radio" name="complementary-cancel-scope" value="single" checked={scope === "single"} onChange={() => setScope("single")} className="focus-ring h-4 w-4 accent-primary" />
          Somente esta ocorrência
        </label>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input type="radio" name="complementary-cancel-scope" value="future" checked={scope === "future"} onChange={() => setScope("future")} className="focus-ring h-4 w-4 accent-primary" />
          Esta e as próximas
        </label>
        <p role="status" className="text-xs text-muted">{scope === "future" ? "A série será encerrada a partir desta data, inclusive se for permanente. Não serão criadas novas ocorrências após esse corte." : "As outras ocorrências continuam normalmente."}</p>
      </fieldset> : null}<div className="mt-3 flex justify-end gap-2"><Button size="sm" variant="ghost" disabled={saving} onClick={() => setConfirming(false)}>Voltar</Button><Button size="sm" variant="danger" disabled={saving} onClick={cancel}>{saving ? <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none"/> : <Ban className="h-4 w-4"/>}Cancelar reserva</Button></div></div> : <div className="flex justify-end border-t pt-4"><Button variant="danger" onClick={() => setConfirming(true)}><Ban className="h-4 w-4"/>Cancelar reserva</Button></div> : null}</div></Modal>;
}
