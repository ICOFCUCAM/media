"use client";

import { useEffect, useRef, useState } from "react";
import type { DemoState } from "../../lib/demo";
import { getSupabase } from "../../lib/supabase";
import { useAuth } from "../AuthProvider";

/**
 * "Notify me when it's ready" (docs/36 §5). Two real channels:
 *  - email — stored on the user (users.notify_on_finish); the worker sends it
 *    when the production is READY or FAILED, if a mail provider is configured;
 *  - browser — a system notification when this tab is in the background.
 * Preview runs never notify: nothing real is being produced.
 */
export function NotifyToggle({ state }: { state: DemoState | null }) {
  const { user } = useAuth();
  const [on, setOn] = useState(false);
  const [emailable, setEmailable] = useState(false);
  const last = useRef<string | null>(null);

  // Read the saved preference (the column may not exist before migration 0012).
  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !user) return;
    void sb
      .from("users")
      .select("notify_on_finish")
      .eq("id", user.id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) return;
        setEmailable(true);
        setOn(!!data.notify_on_finish);
      });
  }, [user]);

  async function toggle(next: boolean) {
    setOn(next);
    if (next && typeof Notification !== "undefined" && Notification.permission === "default") {
      await Notification.requestPermission().catch(() => "denied");
    }
    const sb = getSupabase();
    if (sb && user && emailable) await sb.from("users").update({ notify_on_finish: next }).eq("id", user.id);
  }

  // Browser notification on the transition to ready / failed of a live run.
  useEffect(() => {
    if (!state?.live) return;
    const key = state.error ? "FAILED" : state.status;
    if (key === last.current) return;
    const prev = last.current;
    last.current = key;
    if (!on || prev === null || (key !== "READY" && key !== "FAILED")) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted" || !document.hidden) return;
    new Notification(key === "READY" ? "Your film is ready" : "The production stopped", {
      body: key === "READY" ? "Open Cineforge to watch the final cut." : state.error ?? "Open Cineforge to see why.",
    });
  }, [state?.live, state?.status, state?.error, on]);

  if (!user) return null;
  return (
    <label className="flex min-h-[32px] cursor-pointer items-center gap-2.5 text-[13px] text-cf-muted">
      <input type="checkbox" checked={on} onChange={(e) => void toggle(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--cf-accent))]" />
      Notify me when it&apos;s ready{emailable ? " (email + browser)" : ""}
    </label>
  );
}
