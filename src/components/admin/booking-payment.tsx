"use client";
import { useContext } from "react";
import { ManagementAccess } from "./management-access";
import { OriginPayments } from "./origin-payments";
import type { BookingPaymentTarget } from "@/lib/financial";

export function BookingPayment({ target }: { target: BookingPaymentTarget }) {
  const enabled = useContext(ManagementAccess);
  return enabled ? <OriginPayments key={`${target.type}:${target.id}`} target={target} /> : null;
}
