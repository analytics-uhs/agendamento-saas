"use client";

import { LoaderCircle } from "lucide-react";
import type { MouseEvent } from "react";
import { useRef, useState, useTransition } from "react";
import { recordAppointmentReminder } from "@/app/admin/appointment-actions";
import { WhatsappIcon } from "@/components/ui/social-icons";
import { buildAppointmentWhatsappUrl } from "@/lib/appointment-reminder";
import { classes } from "@/lib/classes";
import type { AdminAppointment } from "@/types/appointments";

type Props = {
  appointment: AdminAppointment;
  variant?: "icon" | "full";
  onReminderSent?: (reminderSentAt: string) => void;
};

export function AppointmentWhatsappReminder({
  appointment,
  variant = "icon",
  onReminderSent,
}: Props) {
  const whatsappUrl = buildAppointmentWhatsappUrl(appointment);
  const [localSentAt, setLocalSentAt] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();
  const requestInFlight = useRef(false);
  const reminderSentAt = localSentAt ?? appointment.reminderSentAt;

  if (!whatsappUrl) return null;

  function recordClick(event: MouseEvent<HTMLAnchorElement>) {
    if (requestInFlight.current) {
      event.preventDefault();
      return;
    }

    requestInFlight.current = true;
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await recordAppointmentReminder(appointment.id);
        setFeedback({
          ok: result.ok,
          message: result.ok ? "Lembrete enviado" : "Registro não salvo",
        });
        if (result.ok) {
          setLocalSentAt(result.data.reminderSentAt);
          onReminderSent?.(result.data.reminderSentAt);
        }
      } catch {
        setFeedback({ ok: false, message: "Registro não salvo" });
      } finally {
        requestInFlight.current = false;
      }
    });
  }

  return (
    <div
      className={classes(
        "flex items-center gap-1.5",
        variant === "full" && "flex-wrap",
      )}
    >
      {variant === "icon" && reminderSentAt ? (
        <span className="whitespace-nowrap text-[11px] font-medium text-success">
          Lembrete enviado
        </span>
      ) : null}
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={recordClick}
        aria-label={
          variant === "icon" ? "Enviar lembrete pelo WhatsApp" : undefined
        }
        title={variant === "icon" ? "Enviar lembrete pelo WhatsApp" : undefined}
        aria-disabled={pending}
        className={classes(
          "focus-ring inline-flex items-center justify-center rounded-xl font-semibold transition-colors",
          variant === "icon" &&
            "h-8 w-8 border border-[#25D366]/35 bg-[#25D366]/10 text-[#159447] hover:bg-[#25D366]/20",
          variant === "full" &&
            "min-h-11 w-full gap-2 bg-[#25D366] px-4 text-sm text-white hover:bg-[#20bd5a] sm:w-auto",
          pending && "pointer-events-none opacity-60",
        )}
      >
        {pending ? (
          <LoaderCircle
            className={classes(
              "animate-spin",
              variant === "icon" ? "h-4 w-4" : "h-5 w-5",
            )}
          />
        ) : (
          <WhatsappIcon
            className={variant === "icon" ? "h-4 w-4" : "h-5 w-5"}
          />
        )}
        {variant === "full" ? "Enviar lembrete pelo WhatsApp" : null}
      </a>
      {feedback && (variant === "full" || !feedback.ok) ? (
        <span
          role="status"
          className={classes(
            "text-xs font-medium",
            feedback.ok ? "text-success" : "text-danger",
          )}
        >
          {feedback.message}
        </span>
      ) : null}
    </div>
  );
}
