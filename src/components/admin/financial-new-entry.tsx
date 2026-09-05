"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { FinancialForm } from "./financial-form";
export function FinancialNewEntry() {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const router = useRouter();
  return <div><Button onClick={() => { setOpen(true); setSaved(false); }}>Novo lançamento</Button>{saved && <p role="status" className="mt-2 text-sm text-success">Lançamento registrado.</p>}{open && <Modal title="Novo lançamento" onClose={() => setOpen(false)}><div className="p-4 sm:p-5"><FinancialForm onCancel={() => setOpen(false)} onSaved={() => { setOpen(false); setSaved(true); router.refresh(); }} /></div></Modal>}</div>;
}
