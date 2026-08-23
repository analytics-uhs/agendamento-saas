import { Repeat2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function RecurringBadge() {
  return <Badge title="Agendamento recorrente" variant="primary" size="compact" className="shrink-0"><Repeat2 className="h-3 w-3" />Recorrente</Badge>;
}
