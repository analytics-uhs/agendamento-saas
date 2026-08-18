"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { initialState } from "@/mocks/app";
import type { AppointmentStatus, MockAppState } from "@/types/scheduling";

type MockAppContextValue = {
  state: MockAppState;
  update: (patch: Partial<MockAppState>) => void;
  setStatus: (id: string, status: AppointmentStatus) => void;
};

const MockAppContext = createContext<MockAppContextValue | null>(null);

export function MockAppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState(initialState);
  const value = useMemo<MockAppContextValue>(() => ({
    state,
    update: (patch) => setState((current) => ({ ...current, ...patch })),
    setStatus: (id, status) => setState((current) => ({
      ...current,
      appointments: current.appointments.map((appointment) => appointment.id === id ? { ...appointment, status } : appointment),
    })),
  }), [state]);
  return <MockAppContext.Provider value={value}>{children}</MockAppContext.Provider>;
}

export function useMockApp() {
  const value = useContext(MockAppContext);
  if (!value) throw new Error("useMockApp deve ser usado dentro de MockAppProvider");
  return value;
}
