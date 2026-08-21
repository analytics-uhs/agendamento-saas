import assert from "node:assert/strict";
import test from "node:test";
import { appointmentDetailActions } from "./appointment-detail-actions";

test("detalhes exibem somente as quatro ações padronizadas", () => {
  assert.deepEqual(
    appointmentDetailActions.map(({ id, label }) => ({ id, label })),
    [
      { id: "edit", label: "Editar" },
      { id: "completed", label: "Concluir" },
      { id: "no_show", label: "Não compareceu" },
      { id: "cancelled", label: "Cancelar" },
    ],
  );
  assert.equal(appointmentDetailActions.some((action) => action.id.includes("reminder")), false);
});

test("ações de status usam as variantes semânticas esperadas", () => {
  assert.deepEqual(
    Object.fromEntries(appointmentDetailActions.map((action) => [action.id, action.variant])),
    { edit: "outline", completed: "success", no_show: "warning", cancelled: "danger" },
  );
});
