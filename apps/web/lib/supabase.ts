"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Browser Supabase client (publishable key — every read/write is gated by RLS).
 * Returns null when env isn't configured, so the studio can fall back to the
 * built-in preview engine without crashing. See docs/25-supabase.md.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const SUPABASE_ENABLED = Boolean(url && key);

let client: SupabaseClient<Database> | null = null;

export function getSupabase(): SupabaseClient<Database> | null {
  if (!SUPABASE_ENABLED) return null;
  if (!client) {
    client = createClient<Database>(url!, key!, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}
