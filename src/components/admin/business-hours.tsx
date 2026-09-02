"use client";

import { useState, useTransition } from "react";
import { saveHours, saveBookingNotice } from "@/app/admin/actions";
import { bookingNoticeOptions } from "@/lib/booking-notice";
import { Label, Select } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { BusinessHoursEditor } from "@/components/business-hours-editor";
import { SaveNotice } from "@/components/admin/save-notice";
import { Button } from "@/components/ui/button";
import type { ActionResult, BusinessHourForm } from "@/types/business";

export function BusinessHours({ initialHours, initialNotice = 60 }: { initialHours: BusinessHourForm[]; initialNotice?: number }) {
  const [hours, setHours] = useState(initialHours);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState(initialNotice);
  const [noticeResult, setNoticeResult] = useState<ActionResult | null>(null);
  const [noticePending, saveNotice] = useTransition();

  return <><PageHeader title="Horários" description="Defina quando novos horários podem ser reservados." /><section className="mt-6 space-y-3"><div><h2 className="text-sm font-semibold">Horários de funcionamento</h2><p className="text-xs text-muted">Adicione períodos separados para almoço ou turnos.</p></div><BusinessHoursEditor hours={hours} onChange={setHours} /></section>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><SaveNotice result={result} /><Button disabled={pending} onClick={() => startTransition(async () => setResult(await saveHours(hours)))}>{pending ? "Salvando..." : "Salvar horários"}</Button></div>
    <section className="mt-8 space-y-3 border-t pt-6" aria-label="Antecedência para agendamentos públicos">
      <div className="space-y-2 sm:max-w-sm">
        <Label htmlFor="booking-notice">Antecedência mínima</Label>
        <p id="booking-notice-help" className="text-sm text-muted">Define quanto tempo antes o cliente precisa agendar pelo link público. Não se aplica aos agendamentos feitos pelo Admin.</p>
        <Select id="booking-notice" aria-describedby="booking-notice-help" value={notice} disabled={noticePending} onChange={(event) => { setNotice(Number(event.target.value)); setNoticeResult(null); }}>
          {!bookingNoticeOptions.some((option) => option.minutes === notice) ? <option value={notice}>{notice} minutos</option> : null}
          {bookingNoticeOptions.map((option) => <option key={option.minutes} value={option.minutes}>{option.label}</option>)}
        </Select>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3"><SaveNotice result={noticeResult} /><Button disabled={noticePending} onClick={() => saveNotice(async () => {
        try { setNoticeResult(await saveBookingNotice(notice)); }
        catch { setNoticeResult({ ok: false, message: "Não foi possível salvar. Tente novamente." }); }
      })}>{noticePending ? "Salvando..." : "Salvar antecedência"}</Button></div>
    </section>
  </>;
}
