"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabase } from "../lib/supabase";
import { useAuth } from "./AuthProvider";

/**
 * One tap to join a closed marketplace catalogue's waitlist (docs/36 §7).
 * Stored per user in marketplace_waitlist (migration 0012) so the team sees
 * real demand; joining twice is a no-op. Signed-out visitors are sent to sign in.
 */
export function WaitlistButton({ catalogue }: { catalogue: string }) {
  const { enabled, user } = useAuth();
  const [joined, setJoined] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !user) return;
    void sb
      .from("marketplace_waitlist")
      .select("catalogue")
      .eq("user_id", user.id)
      .eq("catalogue", catalogue)
      .maybeSingle()
      .then(({ data, error: e }) => setJoined(e ? null : !!data));
  }, [user, catalogue]);

  if (!enabled) return <span className="text-[13px] text-cf-muted">Not open yet</span>;
  if (!user)
    return (
      <Link href="/projects" className="cf-link text-cf-muted">
        Sign in to join the waitlist →
      </Link>
    );
  if (joined) return <span className="text-[13px] font-medium text-cf-ok">✓ On the waitlist</span>;

  async function join() {
    const sb = getSupabase();
    if (!sb || !user) return;
    setBusy(true);
    const { error: e } = await sb.from("marketplace_waitlist").upsert({ user_id: user.id, catalogue }, { ignoreDuplicates: true });
    setBusy(false);
    if (e) setError(true);
    else setJoined(true);
  }

  return (
    <div>
      <button type="button" onClick={() => void join()} disabled={busy} className="cf-btn-line w-full">
        {busy ? "Joining…" : "Join the waitlist"}
      </button>
      {error && <p className="mt-2 text-[12px] text-cf-danger">Could not join right now — try again.</p>}
    </div>
  );
}
