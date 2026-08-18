import { addDays, toISO } from "@/lib/date";
import type { MockAppState } from "@/types/scheduling";

const dateFromToday = (offset: number) => toISO(addDays(new Date(), offset));

export const initialState: MockAppState = {
  business: { name: "Studio Aurora", whatsapp: "(11) 99999-0000", slug: "studio-aurora" },
  group1: {
    label: "Profissional", enabled: true,
    options: [{ id: "g1-1", name: "Arthur" }, { id: "g1-2", name: "Rebeca" }, { id: "g1-3", name: "Cláudio" }],
  },
  group2: {
    label: "Serviço", enabled: true,
    options: [
      { id: "g2-1", name: "Corte", durationMinutes: 30 },
      { id: "g2-2", name: "Barba", durationMinutes: 30 },
      { id: "g2-3", name: "Corte + Barba", durationMinutes: 60 },
      { id: "g2-4", name: "Unhas", durationMinutes: 45 },
    ],
  },
  duration: { mode: "group2", fixedMinutes: 60, maxBlocks: 3 },
  hours: [
    { day: "mon", label: "Segunda", enabled: true, start: "08:00", end: "18:00" },
    { day: "tue", label: "Terça", enabled: true, start: "08:00", end: "18:00" },
    { day: "wed", label: "Quarta", enabled: true, start: "08:00", end: "18:00" },
    { day: "thu", label: "Quinta", enabled: true, start: "08:00", end: "18:00" },
    { day: "fri", label: "Sexta", enabled: true, start: "08:00", end: "20:00" },
    { day: "sat", label: "Sábado", enabled: true, start: "09:00", end: "14:00" },
    { day: "sun", label: "Domingo", enabled: false, start: "09:00", end: "12:00" },
  ],
  paletteId: "original",
  appointments: [
    { id: "a1", date: dateFromToday(0), time: "09:00", durationMinutes: 30, customer: "João Pereira", whatsapp: "(11) 98888-1010", group1: "Arthur", group2: "Corte", status: "scheduled" },
    { id: "a2", date: dateFromToday(0), time: "10:00", durationMinutes: 45, customer: "Maria Souza", whatsapp: "(11) 97777-2020", group1: "Rebeca", group2: "Unhas", status: "scheduled" },
    { id: "a3", date: dateFromToday(0), time: "11:30", durationMinutes: 60, customer: "Carlos Lima", whatsapp: "(11) 96666-3030", group1: "Cláudio", group2: "Corte + Barba", status: "scheduled" },
    { id: "a4", date: dateFromToday(0), time: "14:00", durationMinutes: 30, customer: "Fernanda Dias", whatsapp: "(11) 95555-4040", group1: "Arthur", group2: "Barba", status: "done" },
    { id: "a5", date: dateFromToday(1), time: "09:30", durationMinutes: 30, customer: "Rafael Nunes", whatsapp: "(11) 94444-5050", group1: "Rebeca", group2: "Corte", status: "scheduled" },
    { id: "a6", date: dateFromToday(2), time: "16:00", durationMinutes: 60, customer: "Beatriz Alves", whatsapp: "(11) 93333-6060", group1: "Cláudio", group2: "Corte + Barba", status: "canceled" },
  ],
};
