"use client";

import type { ReactNode } from "react";
import { useAuth } from "../AuthProvider";
import { AuthCard } from "../AuthCard";
import { EmptyState } from "./primitives";

/**
 * The one gate every persisted room shares: no Supabase → say so; loading →
 * say so; signed out → the real sign-in card; otherwise the room itself.
 */
export function StudioGate({ signIn, what, children }: { signIn: string; what: string; children: ReactNode }) {
  const { enabled, loading, user } = useAuth();
  if (!enabled) {
    return <EmptyState title={<>{what} need <em>a studio.</em></>} hint="Connect Supabase (NEXT_PUBLIC_SUPABASE_URL) to persist them." />;
  }
  if (loading) return <p className="cf-label py-10">Opening the room…</p>;
  if (!user) {
    return (
      <div className="py-10">
        <AuthCard title={signIn} />
      </div>
    );
  }
  return <>{children}</>;
}
