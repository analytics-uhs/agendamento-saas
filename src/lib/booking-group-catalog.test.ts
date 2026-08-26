import assert from "node:assert/strict";
import test from "node:test";
import type { Database } from "@/types/database";
import { mapBookingGroupCatalog } from "./repositories/booking-groups";

type GroupRow = Database["public"]["Tables"]["booking_groups"]["Row"];
type OptionRow = Database["public"]["Tables"]["booking_options"]["Row"];

const timestamps = { created_at: "2026-08-26T00:00:00Z", updated_at: "2026-08-26T00:00:00Z" };

test("mapeia e ordena o catálogo complementar sem ativar o fluxo público", () => {
  const groups: GroupRow[] = [
    { id: "group-3", business_id: "business", position: 3, label: "Escolha o espaço", intent_name: "Espaço", occupancy_mode: "day", active: true, required: false, sort_order: 3, ...timestamps },
    { id: "group-1", business_id: "business", position: 1, label: "Escolha principal", intent_name: null, occupancy_mode: null, active: true, required: true, sort_order: 1, ...timestamps },
  ];
  const options: OptionRow[] = [
    { id: "option-2", business_id: "business", group_id: "group-3", name: "Espaço 2", duration_minutes: null, active: true, sort_order: 2, ...timestamps },
    { id: "option-1", business_id: "business", group_id: "group-3", name: "Espaço 1", duration_minutes: null, active: true, sort_order: 1, ...timestamps },
  ];

  const result = mapBookingGroupCatalog(groups, options);

  assert.deepEqual(result.map((group) => group.role), ["primary", "complementary"]);
  assert.equal(result[1].intentName, "Espaço");
  assert.equal(result[1].occupancyMode, "day");
  assert.deepEqual(result[1].options.map((option) => option.name), ["Espaço 1", "Espaço 2"]);
});

test("descarta posições desconhecidas recebidas fora do contrato", () => {
  const groups = [{ id: "invalid", business_id: "business", position: 4, label: "Inválido", intent_name: null, occupancy_mode: null, active: true, required: true, sort_order: 4, ...timestamps }] as GroupRow[];
  assert.deepEqual(mapBookingGroupCatalog(groups, []), []);
});
