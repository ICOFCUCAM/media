"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabase, SUPABASE_ENABLED } from "../lib/supabase";

export interface Profile {
  tier: "FREE" | "CREATOR" | "STUDIO" | "AGENCY" | "ENTERPRISE";
  creditsMs: number;
  role: "USER" | "ADMIN";
}

interface AuthState {
  enabled: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  /** The signed-in user's tier/credits/role (null until loaded). */
  profile: Profile | null;
  refreshProfile: () => void;
  signUp: (email: string, password: string) => Promise<{ error?: string }>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);

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

  const loadProfile = useCallback(async () => {
    const sb = getSupabase();
    const uid = session?.user?.id;
    if (!sb || !uid) {
      setProfile(null);
      return;
    }
    const { data } = await sb.from("users").select("tier, credits_ms, role").eq("id", uid).single();
    if (data) setProfile({ tier: data.tier, creditsMs: data.credits_ms, role: data.role });
  }, [session?.user?.id]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const value: AuthState = {
    enabled: SUPABASE_ENABLED,
    loading,
    session,
    user: session?.user ?? null,
    profile,
    refreshProfile: () => void loadProfile(),
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
