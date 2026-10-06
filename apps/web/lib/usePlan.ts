"use client";

import { useAuth } from "../components/AuthProvider";
import { MAX_FILM_SEC } from "./plans";

/**
 * The signed-in plan, as the studios need it: the runtime ceiling the worker
 * enforces (planCapSec) and a display name. Free until the profile loads;
 * admins are uncapped.
 */
export function usePlan() {
  const { profile } = useAuth();
  const tier = profile?.tier ?? "FREE";
  const isAdmin = profile?.role === "ADMIN";
  return {
    tier,
    isAdmin,
    maxSec: isAdmin ? Number.MAX_SAFE_INTEGER : MAX_FILM_SEC[tier],
    name: isAdmin ? "Admin" : tier.charAt(0) + tier.slice(1).toLowerCase(),
  };
}
