import { parseISO } from "@/lib/date";

const weekdayNames = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

export function recurrenceWeekday(date: string) {
  return weekdayNames[parseISO(date).getDay()];
}

export function recurrenceSummary(date: string, startTime: string, repeatCount: number | null) {
  const ending = repeatCount === null ? "permanente" : `${repeatCount} ocorrências`;
  return `Toda ${recurrenceWeekday(date)} às ${startTime.slice(0, 5)} — ${ending}`;
}

export function occurrenceNumber(startsOn: string, appointmentDate: string) {
  return Math.floor((parseISO(appointmentDate).getTime() - parseISO(startsOn).getTime()) / 604_800_000) + 1;
}
