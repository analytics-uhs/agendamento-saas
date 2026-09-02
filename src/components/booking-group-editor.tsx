import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { classes } from "@/lib/classes";
import { bookingGroupPosition, bookingGroupProductName } from "@/lib/booking-groups";
import type { ReactNode } from "react";
import type { BusinessGroupForm, BusinessOptionForm } from "@/types/business";

type BookingGroupEditorProps = {
  group: BusinessGroupForm;
  showDuration?: boolean;
  onChange: (group: BusinessGroupForm) => void;
  renderOptionSchedule?: (option: BusinessOptionForm) => ReactNode;
};

export function BookingGroupEditor({ group, showDuration = false, onChange, renderOptionSchedule }: BookingGroupEditorProps) {
  const groupName = bookingGroupProductName(group.position);
  const complementary = group.position === bookingGroupPosition("complementary");
  const patch = (values: Partial<BusinessGroupForm>) => onChange({ ...group, ...values });
  const moveOption = (optionIndex: number, direction: -1 | 1) => {
    const options = [...group.options];
    const target = optionIndex + direction;
    if (target < 0 || target >= options.length) return;
    [options[optionIndex], options[target]] = [options[target], options[optionIndex]];
    patch({ options });
  };

  return (
    <Card as="section" padding="md">
      <div className="grid grid-cols-[1fr_auto] items-start gap-4">
        <div>
          <h2 className="text-sm font-semibold">{groupName}</h2>
          {complementary ? (
            <p className="mt-1 max-w-md text-xs text-muted">
              Opcional. Configure um recurso adicional que pode ocupar um horário ou um dia inteiro.
            </p>
          ) : null}
        </div>
        <div className="flex flex-col items-center gap-1">
          <Switch checked={group.active} onChange={(active) => patch({ active })} label={`Ativar ${groupName}`} />
          <span className="text-xs text-muted">{group.active ? "Ativo" : "Inativo"}</span>
        </div>
      </div>

      {complementary && !group.active ? (
        <p className="mt-4 rounded-xl border border-dashed px-3 py-3 text-sm text-muted">
          Ative somente se o cliente também puder reservar um recurso complementar.
        </p>
      ) : (
        <div className={classes("mt-4 space-y-4", !group.active && "opacity-45")}>
          <div className={classes("grid gap-4", complementary && "sm:grid-cols-2")}>
            <div className="space-y-2">
              <Label htmlFor={`group-${group.position}-name`}>Nome exibido</Label>
              <Input
                id={`group-${group.position}-name`}
                value={group.label}
                onChange={(event) => patch({ label: event.target.value })}
                placeholder={complementary ? "Ex.: Espaço adicional" : undefined}
              />
            </div>
            {complementary ? (
              <div className="space-y-2">
                <Label htmlFor="group-3-intent">Nome curto</Label>
                <Input
                  id="group-3-intent"
                  maxLength={80}
                  value={group.intentName}
                  onChange={(event) => patch({ intentName: event.target.value })}
                  placeholder="Ex.: Espaço"
                />
                <p className="text-xs text-muted">Será usado no futuro seletor de reserva; não é derivado do nome exibido.</p>
              </div>
            ) : null}
          </div>

          {complementary ? (
            <div className="space-y-2">
              <Label htmlFor="group-3-occupancy">Como ocupa a agenda</Label>
              <Select
                id="group-3-occupancy"
                value={group.occupancyMode ?? ""}
                onChange={(event) => patch({ occupancyMode: event.target.value === "time_slot" ? "time_slot" : "day" })}
              >
                <option value="time_slot">Por horário</option>
                <option value="day">Dia inteiro</option>
              </Select>
              <p className="text-xs text-muted">
                {group.occupancyMode === "time_slot"
                  ? "Cada reserva complementar terá seu próprio intervalo."
                  : "Cada opção poderá receber uma única reserva por data."}
              </p>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>Opções</Label>
            {group.options.map((option, optionIndex) => (
              <div key={option.id ?? `new-${optionIndex}`} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                <Input
                  aria-label={`Opção ${optionIndex + 1} do ${groupName}`}
                  value={option.name}
                  onChange={(event) => patch({
                    options: group.options.map((item, itemIndex) => itemIndex === optionIndex
                      ? { ...item, name: event.target.value }
                      : item),
                  })}
                />
                <div className="flex items-center justify-end gap-1">
                  {showDuration ? (
                    <>
                      <Input
                        aria-label={`Duração de ${option.name || `opção ${optionIndex + 1}`}`}
                        type="number"
                        min={5}
                        max={1440}
                        step={5}
                        className="max-w-24"
                        value={option.durationMinutes ?? 30}
                        onChange={(event) => patch({
                          options: group.options.map((item, itemIndex) => itemIndex === optionIndex
                            ? { ...item, durationMinutes: Number(event.target.value) }
                            : item),
                        })}
                      />
                      <span className="text-xs text-muted">min</span>
                    </>
                  ) : null}
                  <Button variant="ghost" size="icon" aria-label="Mover opção para cima" disabled={optionIndex === 0} onClick={() => moveOption(optionIndex, -1)}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Mover opção para baixo" disabled={optionIndex === group.options.length - 1} onClick={() => moveOption(optionIndex, 1)}>
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Remover opção" onClick={() => patch({ options: group.options.filter((_, itemIndex) => itemIndex !== optionIndex) })}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {group.position === bookingGroupPosition("primary") ? renderOptionSchedule?.(option) : null}
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => patch({ options: [...group.options, { name: "", durationMinutes: showDuration ? 30 : null }] })}>
              <Plus className="h-4 w-4" />
              Adicionar opção
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
