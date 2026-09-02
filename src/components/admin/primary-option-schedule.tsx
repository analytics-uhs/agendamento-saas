"use client";

import { ChevronDown, Clock } from "lucide-react";
import { useId, useRef, useState } from "react";
import { loadOptionSchedule, saveOptionSchedule } from "@/app/admin/option-schedule-actions";
import { OptionScheduleEditor } from "@/components/admin/option-schedule-editor";
import { Button } from "@/components/ui/button";
import type { OptionSchedule } from "@/lib/option-schedule-form";
import type { BusinessOptionForm } from "@/types/business";

export function PrimaryOptionSchedule({ option }: { option: BusinessOptionForm }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<OptionSchedule | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetching = useRef(false);
  async function load() {
    if (!option.id || fetching.current) return;
    fetching.current = true; setLoading(true); setError(null);
    try {
      const result = await loadOptionSchedule(option.id);
      if (result.ok && result.data) setData(result.data);
      else setError(result.message);
    } catch { setError("Não foi possível carregar os horários. Tente novamente."); }
    finally { fetching.current = false; setLoading(false); }
  }
  return <div className="sm:col-span-2">
    {!option.id ? <p className="px-1 text-xs text-muted">Salve a configuração para personalizar os horários desta opção.</p> : <>
      <Button variant="ghost" size="sm" aria-expanded={open} aria-controls={id}
        aria-label={`Horários de ${option.name}`} onClick={() => {
          setOpen(!open);
          if (!open && !data) void load();
        }}>
        <Clock className="h-4 w-4" />Horário de disponibilidade<ChevronDown className="h-4 w-4" />
      </Button>
      {/* Hidden rather than unmounted: collapsing must not discard edits. */}
      <div id={id} hidden={!open} className="mt-3 border-t py-4">
        {loading ? <p role="status" className="text-sm text-muted">Carregando horários...</p> : null}
        {error ? <div className="space-y-2"><p role="alert" className="text-sm text-danger">{error}</p><Button variant="outline" size="sm" onClick={load}>Tentar novamente</Button></div> : null}
        {data ? <OptionScheduleEditor initial={data} onSave={(mode, hours) => saveOptionSchedule(option.id!, mode, hours)} /> : null}
      </div>
    </>}
  </div>;
}
