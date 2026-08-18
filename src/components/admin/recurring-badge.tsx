import { Repeat2 } from "lucide-react";

export function RecurringBadge() {
  return <span title="Agendamento recorrente" className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary"><Repeat2 className="h-3 w-3" />Recorrente</span>;
}
