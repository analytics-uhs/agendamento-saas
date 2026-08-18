"use client";

import { LoaderCircle, Power } from "lucide-react";
import { useActionState } from "react";
import { changePlatformBusinessStatus } from "@/app/super-admin/actions";
import { Button } from "@/components/ui/button";
import { classes } from "@/lib/classes";
import type { ActionResult } from "@/types/business";

const initialState: ActionResult = { ok: true, message: "" };

export function BusinessStatusControl({ businessId, active, businessName }: { businessId: string; active: boolean; businessName: string }) {
  const [state, action, pending] = useActionState(changePlatformBusinessStatus, initialState);
  return <div>
    <form action={action} onSubmit={(event) => {
      if (!window.confirm(`${active ? "Inativar" : "Ativar"} ${businessName}?`)) event.preventDefault();
    }}>
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="active" value={String(!active)} />
      <Button type="submit" variant={active ? "danger" : "primary"} disabled={pending}>{pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}{pending ? "Salvando..." : active ? "Inativar negócio" : "Ativar negócio"}</Button>
    </form>
    {state.message ? <p role="status" className={classes("mt-2 text-sm", state.ok ? "text-success" : "text-danger")}>{state.message}</p> : null}
  </div>;
}

