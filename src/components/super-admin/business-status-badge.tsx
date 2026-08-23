import { Badge } from "@/components/ui/badge";

export function BusinessStatusBadge({ active }: { active: boolean }) {
  return <Badge variant={active ? "success" : "danger"}>{active ? "Ativo" : "Inativo"}</Badge>;
}
