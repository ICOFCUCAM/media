"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabase, SUPABASE_ENABLED } from "../lib/supabase";

interface AuthState {
  enabled: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  signUp: (email: string, password: string) => Promise<{ error?: string }>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      setLoading(false);
      return;
    }
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const value: AuthState = {
    enabled: SUPABASE_ENABLED,
    loading,
    session,
    user: session?.user ?? null,
    async signUp(email, password) {
      const sb = getSupabase();
      if (!sb) return { error: "Supabase not configured" };
      const { error } = await sb.auth.signUp({ email, password });
      return error ? { error: error.message } : {};
    },
    async signIn(email, password) {
      const sb = getSupabase();
      if (!sb) return { error: "Supabase not configured" };
      const { error } = await sb.auth.signInWithPassword({ email, password });
      return error ? { error: error.message } : {};
    },
    async signOut() {
      await getSupabase()?.auth.signOut();
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
