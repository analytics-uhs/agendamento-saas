"use client";
import { createContext } from "react";
// Presentation only. Every financial read/write is independently guarded server-side.
export const ManagementAccess = createContext(false);
