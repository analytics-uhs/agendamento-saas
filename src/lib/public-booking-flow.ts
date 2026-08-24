export type PublicBookingStepId = "group_1" | "group_2" | "date" | "time" | "customer";

export type PublicBookingStep = {
  id: PublicBookingStepId;
  label: string;
};

export function publicBookingSteps(groupOneLabel?: string, groupTwoLabel?: string): PublicBookingStep[] {
  return [
    ...(groupOneLabel ? [{ id: "group_1" as const, label: groupOneLabel }] : []),
    ...(groupTwoLabel ? [{ id: "group_2" as const, label: groupTwoLabel }] : []),
    { id: "date", label: "Data" },
    { id: "time", label: "Horário" },
    { id: "customer", label: "Seus dados" },
  ];
}

export function bookingCtaHelper({
  groupOneMissing,
  groupTwoMissing,
  dateMissing,
  timeMissing,
  customerMissing,
  whatsappMissing,
}: {
  groupOneMissing: boolean;
  groupTwoMissing: boolean;
  dateMissing: boolean;
  timeMissing: boolean;
  customerMissing: boolean;
  whatsappMissing: boolean;
}) {
  if (groupOneMissing || groupTwoMissing) return "Conclua as escolhas acima para continuar.";
  if (dateMissing) return "Escolha uma data para continuar.";
  if (timeMissing) return "Escolha um horário para continuar.";
  if (customerMissing || whatsappMissing) return "Informe seu nome e WhatsApp para confirmar.";
  return "Revise os dados e confirme seu agendamento.";
}
