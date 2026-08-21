"use client";

import {
  Clock3,
  LoaderCircle,
  Plus,
  Repeat2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  createManualAppointment,
  createRecurringAppointment,
  loadAdminAppointments,
  loadAdminAvailability,
} from "@/app/admin/agenda/actions";
import { AppointmentWhatsappReminder } from "@/components/admin/appointment-whatsapp-reminder";
import { AppointmentDetails } from "@/components/admin/appointment-details";
import { useAppointmentManagement } from "@/components/admin/use-appointment-management";
import { PageHeading } from "@/components/admin/page-heading";
import { RecurringBadge } from "@/components/admin/recurring-badge";
import { StatusBadge } from "@/components/admin/status-badge";
import { DateStrip } from "@/components/booking/date-strip";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/field";
import { manualAppointmentDuration } from "@/lib/appointments";
import { classes } from "@/lib/classes";
import {
  formatDuration,
  formatLongDate,
  todayISO,
} from "@/lib/date";
import { recurrenceSummary } from "@/lib/recurrence";
import type {
  AdminAppointment,
  AppointmentSchedulingConfig,
} from "@/types/appointments";
import type { BookingSlot } from "@/types/public-booking";

type FormState = {
  customerName: string;
  customerWhatsapp: string;
  group1OptionId: string | null;
  group2OptionId: string | null;
  startTime: string | null;
  blocks: number;
  recurring: boolean;
  recurrenceType: "permanent" | "count";
  repeatCount: number;
};

function initialForm(config: AppointmentSchedulingConfig): FormState {
  return {
    customerName: "",
    customerWhatsapp: "",
    group1OptionId:
      config.groups.find((group) => group.position === 1)?.options[0]?.id ??
      null,
    group2OptionId:
      config.groups.find((group) => group.position === 2)?.options[0]?.id ??
      null,
    startTime: null,
    blocks: 1,
    recurring: false,
    recurrenceType: "permanent",
    repeatCount: 12,
  };
}

export function AgendaPageContent({
  initialDate,
  initialAppointments,
  config,
  businessActive,
  embedded = false,
  initialCreating = false,
}: {
  initialDate: string;
  initialAppointments: AdminAppointment[];
  config: AppointmentSchedulingConfig;
  businessActive: boolean;
  embedded?: boolean;
  initialCreating?: boolean;
}) {
  const [windowStart, setWindowStart] = useState(initialDate);
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [creating, setCreating] = useState(initialCreating);
  const [form, setForm] = useState(() => initialForm(config));
  const [slots, setSlots] = useState<BookingSlot[]>([]);
  const [loadingAgenda, startAgendaTransition] = useTransition();
  const [loadingSlots, startSlotsTransition] = useTransition();
  const {
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
  } = useAppointmentManagement(initialAppointments, selectedDate);
  const agendaRequest = useRef(0);
  const slotRequest = useRef(0);
  const initialCreationHandled = useRef(false);
  const groupOne = config.groups.find((group) => group.position === 1);
  const groupTwo = config.groups.find((group) => group.position === 2);
  const selectedSlot = slots.find((slot) => slot.startTime === form.startTime);
  const selectedGroupTwo = groupTwo?.options.find(
    (option) => option.id === form.group2OptionId,
  );
  const selectedDuration = manualAppointmentDuration({
    mode: config.durationMode,
    fixedDurationMinutes: config.fixedDurationMinutes,
    group2DurationMinutes: selectedGroupTwo?.durationMinutes ?? null,
    blocks: form.blocks,
  });
  const configurationInvalid = Boolean(
    (groupOne && groupOne.options.length === 0) ||
    (groupTwo && groupTwo.options.length === 0) ||
    (config.durationMode === "group_2" && !groupTwo),
  );

  useEffect(() => {
    if (!initialCreating || initialCreationHandled.current) return;
    initialCreationHandled.current = true;
    const request = ++slotRequest.current;
    startSlotsTransition(async () => {
      const result = await loadAdminAvailability({
        date: initialDate,
        group1OptionId: form.group1OptionId,
        group2OptionId: form.group2OptionId,
      });
      if (request !== slotRequest.current) return;
      if (result.ok) setSlots(result.data);
      else setFeedback({ ok: false, message: result.message });
    });
  }, [
    form.group1OptionId,
    form.group2OptionId,
    initialCreating,
    initialDate,
    setFeedback,
  ]);

  function fetchAvailability(
    date: string,
    group1OptionId = form.group1OptionId,
    group2OptionId = form.group2OptionId,
  ) {
    const request = ++slotRequest.current;
    setSlots([]);
    setForm((current) => ({ ...current, startTime: null, blocks: 1 }));
    startSlotsTransition(async () => {
      const result = await loadAdminAvailability({
        date,
        group1OptionId,
        group2OptionId,
      });
      if (request !== slotRequest.current) return;
      if (result.ok) setSlots(result.data);
      else setFeedback({ ok: false, message: result.message });
    });
  }

  function selectDate(date: string) {
    const request = ++agendaRequest.current;
    setSelectedDate(date);
    setSelectedId(null);
    setFeedback(null);
    if (creating) fetchAvailability(date);
    startAgendaTransition(async () => {
      const result = await loadAdminAppointments(date);
      if (request !== agendaRequest.current) return;
      if (result.ok) setAppointments(result.data);
      else setFeedback({ ok: false, message: result.message });
    });
  }

  function openCreation() {
    const next = initialForm(config);
    setForm(next);
    setCreating(true);
    setSelectedId(null);
    setFeedback(null);
    fetchAvailability(selectedDate, next.group1OptionId, next.group2OptionId);
  }

  function changeGroup(position: 1 | 2, optionId: string) {
    const nextGroup1 = position === 1 ? optionId : form.group1OptionId;
    const nextGroup2 = position === 2 ? optionId : form.group2OptionId;
    setForm((current) => ({
      ...current,
      group1OptionId: nextGroup1,
      group2OptionId: nextGroup2,
      startTime: null,
      blocks: 1,
    }));
    setFeedback(null);
    fetchAvailability(selectedDate, nextGroup1, nextGroup2);
  }

  function submitManualAppointment() {
    if (!form.startTime) return;
    setFeedback(null);
    startSavingTransition(async () => {
      const input = {
        group1OptionId: form.group1OptionId,
        group2OptionId: form.group2OptionId,
        date: selectedDate,
        startTime: form.startTime!,
        blocks: form.blocks,
        customerName: form.customerName,
        customerWhatsapp: form.customerWhatsapp,
      };
      const result = form.recurring
        ? await createRecurringAppointment({
            ...input,
            repeatCount:
              form.recurrenceType === "count" ? form.repeatCount : null,
          })
        : await createManualAppointment(input);
      if (!result.ok) {
        setFeedback({ ok: false, message: result.message });
        if (result.conflict) fetchAvailability(selectedDate);
        if (result.staleSelection) setCreating(false);
        return;
      }
      setAppointments(result.data);
      setCreating(false);
      setFeedback({ ok: true, message: result.message });
    });
  }

  return (
    <>
      {embedded ? (
        <header id="agenda-operacional" className="scroll-mt-20">
          <h2 className="text-xl font-semibold tracking-tight">
            Agenda operacional
          </h2>
          <p className="mt-1 text-sm text-muted">
            Visualize e gerencie os agendamentos.
          </p>
        </header>
      ) : (
        <PageHeading
          title="Agenda"
          description="Visualize e gerencie os agendamentos."
        />
      )}
      <div className="mt-6">
        <DateStrip
          allowPast
          windowStart={windowStart}
          onWindowStartChange={(value) => {
            setWindowStart(value);
            selectDate(value);
          }}
          selected={selectedDate}
          onSelect={selectDate}
        />
      </div>
      <div className="mt-6 flex items-center justify-between gap-3">
        <p className="truncate text-sm font-medium capitalize">
          {formatLongDate(selectedDate)}
        </p>
        <Button
          size="sm"
          disabled={
            !businessActive || selectedDate < todayISO() || configurationInvalid
          }
          onClick={creating ? () => setCreating(false) : openCreation}
        >
          {creating ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {creating ? "Fechar" : "Novo"}
        </Button>
      </div>

      {configurationInvalid ? (
        <p className="mt-4 rounded-xl border border-dashed p-5 text-center text-sm text-muted">
          Configure opções ativas nos grupos antes de criar agendamentos
          manuais.
        </p>
      ) : null}
      {creating ? (
        <section className="step-in mt-4 rounded-xl border bg-background p-4">
          <h2 className="font-semibold">Novo agendamento</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {groupOne ? (
              <div className="space-y-1">
                <Label htmlFor="new-g1">{groupOne.label}</Label>
                <Select
                  id="new-g1"
                  value={form.group1OptionId ?? ""}
                  onChange={(event) => changeGroup(1, event.target.value)}
                >
                  {groupOne.options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
            {groupTwo ? (
              <div className="space-y-1">
                <Label htmlFor="new-g2">{groupTwo.label}</Label>
                <Select
                  id="new-g2"
                  value={form.group2OptionId ?? ""}
                  onChange={(event) => changeGroup(2, event.target.value)}
                >
                  {groupTwo.options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                      {config.durationMode === "group_2"
                        ? ` · ${formatDuration(option.durationMinutes ?? 0)}`
                        : ""}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
            <div className="space-y-1">
              <Label htmlFor="new-customer">Cliente</Label>
              <Input
                id="new-customer"
                value={form.customerName}
                maxLength={120}
                onChange={(event) =>
                  setForm({ ...form, customerName: event.target.value })
                }
                placeholder="Nome do cliente"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-whatsapp">WhatsApp</Label>
              <Input
                id="new-whatsapp"
                inputMode="tel"
                value={form.customerWhatsapp}
                onChange={(event) =>
                  setForm({ ...form, customerWhatsapp: event.target.value })
                }
                placeholder="(00) 00000-0000"
              />
            </div>
          </div>
          <div className="mt-4">
            <p className="mb-2 text-sm font-medium">Horário</p>
            {loadingSlots ? (
              <p className="flex items-center justify-center gap-2 rounded-xl border border-dashed p-5 text-sm text-muted">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Consultando disponibilidade...
              </p>
            ) : slots.length ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {slots.map((slot) => (
                  <button
                    key={slot.startTime}
                    type="button"
                    onClick={() =>
                      setForm({ ...form, startTime: slot.startTime, blocks: 1 })
                    }
                    className={classes(
                      "focus-ring rounded-xl border bg-card py-2.5 text-sm font-semibold",
                      form.startTime === slot.startTime &&
                        "border-primary bg-primary text-white",
                    )}
                  >
                    {slot.startTime}
                  </button>
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted">
                Nenhum horário disponível nesta data.
              </p>
            )}
          </div>
          {form.startTime &&
          selectedSlot &&
          config.durationMode === "fixed_multiple" ? (
            <div className="mt-4">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted">
                <Clock3 className="h-3.5 w-3.5" />
                Duração a partir de {form.startTime}
              </p>
              <div className="flex flex-wrap gap-2">
                {Array.from(
                  { length: selectedSlot.maxBlocks },
                  (_, index) => index + 1,
                ).map((blocks) => (
                  <button
                    key={blocks}
                    type="button"
                    onClick={() => setForm({ ...form, blocks })}
                    className={classes(
                      "focus-ring rounded-xl border bg-card px-4 py-2 text-sm font-semibold",
                      form.blocks === blocks &&
                        "border-primary bg-primary text-white",
                    )}
                  >
                    {formatDuration(selectedSlot.durationMinutes * blocks)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="mt-4 rounded-xl border bg-surface/50 p-4">
            <label className="flex cursor-pointer items-center gap-3 text-sm font-medium">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={form.recurring}
                onChange={(event) =>
                  setForm({ ...form, recurring: event.target.checked })
                }
              />
              Repetir semanalmente
            </label>
            {form.recurring ? (
              <div className="step-in mt-4 space-y-3 border-t pt-4">
                <p className="text-sm font-medium">Repetição</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex cursor-pointer items-center gap-2 rounded-xl border bg-background p-3 text-sm">
                    <input
                      type="radio"
                      name="recurrence"
                      className="accent-primary"
                      checked={form.recurrenceType === "permanent"}
                      onChange={() =>
                        setForm({ ...form, recurrenceType: "permanent" })
                      }
                    />
                    Permanente
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 rounded-xl border bg-background p-3 text-sm">
                    <input
                      type="radio"
                      name="recurrence"
                      className="accent-primary"
                      checked={form.recurrenceType === "count"}
                      onChange={() =>
                        setForm({ ...form, recurrenceType: "count" })
                      }
                    />
                    Quantidade de repetições
                  </label>
                </div>
                {form.recurrenceType === "count" ? (
                  <div className="max-w-xs space-y-1">
                    <Label htmlFor="repeat-count">Número de repetições</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="repeat-count"
                        type="number"
                        min={2}
                        max={260}
                        value={form.repeatCount}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            repeatCount: Number(event.target.value),
                          })
                        }
                      />
                      <span className="text-sm text-muted">repetições</span>
                    </div>
                  </div>
                ) : null}
                {form.startTime ? (
                  <p className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm font-medium text-primary">
                    <Repeat2 className="h-4 w-4" />
                    {recurrenceSummary(
                      selectedDate,
                      form.startTime,
                      form.recurrenceType === "count" ? form.repeatCount : null,
                    )}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
          {form.startTime ? (
            <p className="mt-4 text-sm text-muted">
              {formatLongDate(selectedDate)} · {form.startTime} ·{" "}
              {selectedDuration
                ? formatDuration(selectedDuration)
                : "duração inválida"}
            </p>
          ) : null}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancelar
            </Button>
            <Button
              disabled={
                saving ||
                !form.startTime ||
                !form.customerName.trim() ||
                !form.customerWhatsapp.trim() ||
                !selectedDuration ||
                (form.recurring &&
                  form.recurrenceType === "count" &&
                  (!Number.isInteger(form.repeatCount) || form.repeatCount < 2))
              }
              onClick={submitManualAppointment}
            >
              {saving ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : null}
              {saving
                ? "Adicionando..."
                : form.recurring
                  ? "Criar recorrência"
                  : "Adicionar"}
            </Button>
          </div>
        </section>
      ) : null}

      {feedback ? (
        <p
          role="status"
          className={classes(
            "mt-4 whitespace-pre-line rounded-xl border p-3 text-sm",
            feedback.ok
              ? "border-success/25 bg-success/10 text-success"
              : "border-danger/25 bg-danger/10 text-danger",
          )}
        >
          {feedback.message}
        </p>
      ) : null}
      <section className="mt-4 overflow-hidden rounded-xl border bg-background">
        {loadingAgenda ? (
          <p className="flex items-center justify-center gap-2 p-8 text-sm text-muted">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Carregando agenda...
          </p>
        ) : appointments.length ? (
          <ul className="divide-y">
            {appointments.map((appointment) => (
              <li key={appointment.id}>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 p-4">
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedId(
                        selectedId === appointment.id ? null : appointment.id,
                      )
                    }
                    className="focus-ring grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-lg text-left"
                  >
                    <span className="text-sm font-semibold tabular-nums">
                      {appointment.startTime}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {appointment.customerName}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {[
                          appointment.group1?.name,
                          appointment.group2?.name,
                          `${appointment.startTime}–${appointment.endTime}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  </button>
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <AppointmentWhatsappReminder
                      appointment={appointment}
                      onReminderSent={(sentAt) =>
                        updateReminder(appointment.id, sentAt)
                      }
                    />
                    {appointment.series ? <RecurringBadge /> : null}
                    <StatusBadge status={appointment.status} />
                  </div>
                </div>
                {selectedId === appointment.id ? (
                  <AppointmentDetails
                    appointment={appointment}
                    saving={saving}
                    cancelling={cancellingId === appointment.id}
                    onStatus={(status) => updateStatus(appointment, status)}
                    onCancelScope={(scope) =>
                      cancelSeriesOccurrence(appointment, scope)
                    }
                    onCancelClose={() => setCancellingId(null)}
                    onReminderSent={(sentAt) =>
                      updateReminder(appointment.id, sentAt)
                    }
                  />
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-8 text-center text-sm text-muted">
            Nenhum agendamento nesta data.
          </p>
        )}
      </section>
    </>
  );
}
