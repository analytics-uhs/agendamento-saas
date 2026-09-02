import type { BookingIntent, PublicBookingGroup, PublicReservationPayload } from "@/types/public-booking";

export type PublicBookingStepId = "intent" | "group_1" | "group_2" | "date" | "time" | "complementary" | "customer" | "review";
export type PublicBookingStep = { id: PublicBookingStepId; label: string };

export function publicBookingSteps(groupOneLabel?: string, groupTwoLabel?: string, intent?: BookingIntent | null, complementaryLabel?: string, complementaryMode?: "day" | "time_slot" | null): PublicBookingStep[] {
  if (complementaryLabel && !intent) return [{ id: "intent", label: "Reserva" }];
  const primary = intent !== "complementary";
  const complementary = intent === "complementary" || intent === "combined";
  return [
    ...(complementaryLabel ? [{ id: "intent" as const, label: "Reserva" }] : []),
    ...(primary && groupOneLabel ? [{ id: "group_1" as const, label: groupOneLabel }] : []),
    ...(primary && groupTwoLabel ? [{ id: "group_2" as const, label: groupTwoLabel }] : []),
    { id: "date" as const, label: "Data" },
    ...(primary || (intent === "complementary" && complementaryMode === "time_slot") ? [{ id: "time" as const, label: "Horário" }] : []),
    ...(complementary ? [{ id: "complementary" as const, label: complementaryLabel ?? "Complemento" }] : []),
    { id: "customer" as const, label: "Seus dados" },
    { id: "review" as const, label: "Revisão" },
  ];
}

export function previousPublicBookingStep(activeStep: PublicBookingStepId, steps: PublicBookingStep[]) {
  const index = steps.findIndex((step) => step.id === activeStep);
  return index > 0 ? steps[index - 1].id : null;
}

export function intentOptions(primary: PublicBookingGroup | undefined, complementary: PublicBookingGroup) {
  const primaryName = primary?.label.trim() || "Agendamento";
  const complementaryName = complementary.intentName?.trim() || complementary.label.trim();
  return [
    { id: "primary" as const, name: primaryName, description: `Reservar somente ${primaryName.toLocaleLowerCase("pt-BR")}` },
    { id: "complementary" as const, name: complementaryName, description: `Reservar somente ${complementaryName.toLocaleLowerCase("pt-BR")}` },
    { id: "combined" as const, name: `${primaryName} + ${complementaryName.toLocaleLowerCase("pt-BR")}`, description: "Combinar as duas escolhas na mesma reserva" },
  ];
}

export function buildPublicReservationPayload(input: {
  intent: BookingIntent; group1OptionId: string | null; group2OptionId: string | null; complementaryOptionId: string | null;
  occupancyMode: "day" | "time_slot" | null; date: string; startTime: string | null; endTime: string | null; blocks: number;
  customerName: string; customerWhatsapp: string;
}): PublicReservationPayload {
  const payload: PublicReservationPayload = { customer_name: input.customerName.trim(), customer_whatsapp: input.customerWhatsapp };
  if (input.intent !== "complementary" && input.startTime) payload.primary = { group_1_option_id: input.group1OptionId, group_2_option_id: input.group2OptionId, date: input.date, start_time: input.startTime, blocks: input.blocks };
  if (input.intent !== "primary" && input.complementaryOptionId && input.occupancyMode) payload.complementary = {
    option_id: input.complementaryOptionId, occupancy_mode: input.occupancyMode, date: input.date,
    ...(input.occupancyMode === "time_slot" && input.startTime && input.endTime ? { start_time: input.startTime, end_time: input.endTime } : {}),
  };
  return payload;
}

export function shouldKeepComplementarySelection(input: { occupancyMode: "day" | "time_slot"; dateChanged: boolean; timeChanged: boolean }) {
  if (input.dateChanged) return false;
  return input.occupancyMode === "day" || !input.timeChanged;
}

export function bookingCtaHelper({ groupOneMissing, groupTwoMissing, dateMissing, timeMissing, complementaryMissing = false, customerMissing, whatsappMissing }: {
  groupOneMissing: boolean; groupTwoMissing: boolean; dateMissing: boolean; timeMissing: boolean; complementaryMissing?: boolean; customerMissing: boolean; whatsappMissing: boolean;
}) {
  if (groupOneMissing || groupTwoMissing) return "Conclua as escolhas acima para continuar.";
  if (dateMissing) return "Escolha uma data para continuar.";
  if (timeMissing) return "Escolha um horário para continuar.";
  if (complementaryMissing) return "Escolha uma opção complementar para continuar.";
  if (customerMissing || whatsappMissing) return "Informe seu nome e WhatsApp para confirmar.";
  return "Revise os dados e confirme seu agendamento.";
}
