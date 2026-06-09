"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Role } from "../lib/products";

/**
 * Client-side role state. Demonstrates the product's role separation: a Creator
 * never sees infrastructure; only a Super Admin does. In production this mirrors
 * `public.users.role` from Supabase Auth and is enforced server-side by RLS —
 * this toggle is the front-of-house equivalent for the demo.
 */
const RoleCtx = createContext<{ role: Role; setRole: (r: Role) => void }>({
  role: "creator",
  setRole: () => {},
});

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>("creator");

  useEffect(() => {
    const saved = window.localStorage.getItem("cineforge.role") as Role | null;
    if (saved) setRole(saved);
  }, []);

  function update(r: Role) {
    setRole(r);
    window.localStorage.setItem("cineforge.role", r);
  }

  return <RoleCtx.Provider value={{ role, setRole: update }}>{children}</RoleCtx.Provider>;
}

export const useRole = () => useContext(RoleCtx);
