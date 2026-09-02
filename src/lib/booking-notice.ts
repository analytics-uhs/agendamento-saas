export const bookingNoticeOptions = [
  { minutes: 0, label: "Sem antecedência" },
  { minutes: 30, label: "30 minutos" },
  { minutes: 60, label: "1 hora" },
  { minutes: 120, label: "2 horas" },
  { minutes: 180, label: "3 horas" },
  { minutes: 360, label: "6 horas" },
  { minutes: 720, label: "12 horas" },
  { minutes: 1440, label: "24 horas" },
] as const;

export function validBookingNotice(value: number) {
  return Number.isInteger(value) && value >= 0 && value <= 2147483647;
}
