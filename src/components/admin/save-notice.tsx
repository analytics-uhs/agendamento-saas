import type { ActionResult } from "@/types/business";

export function SaveNotice({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  return <p role="status" className={result.ok ? "text-sm text-emerald-600" : "text-sm text-danger"}>{result.message}</p>;
}
