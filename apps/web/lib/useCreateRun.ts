"use client";

import { useRef, useState } from "react";
import { DemoRun, type DemoState } from "./demo";
import { LiveRun } from "./live";
import { SupabaseRun } from "./supabase-run";
import { IS_LIVE } from "./system";
import { SUPABASE_ENABLED } from "./supabase";

export interface RunConfig {
  prompt: string;
  modelId: string;
  targetSeconds: number;
  /** Output format ("480p"…"4k") — plan-classified in the UI. */
  resolution?: string;
}

/** Shared generation runner — drives the live API when configured, else the
 *  preview engine. Every create surface composes its own controls around it. */
export function useCreateRun() {
  const [state, setState] = useState<DemoState | null>(null);
  const [running, setRunning] = useState(false);
  const runRef = useRef<{ cancel: () => void } | null>(null);

  async function run(cfg: RunConfig) {
    if (running) return;
    runRef.current?.cancel();
    setRunning(true);
    setState(null);
    const onUpdate = (s: DemoState) => {
      setState(s);
      if (s.status === "READY" || s.error) setRunning(false);
    };
    if (IS_LIVE) {
      const live = new LiveRun(cfg, onUpdate);
      runRef.current = live;
      try {
        await live.start();
        return;
      } catch {
        live.cancel();
      }
    }
    // Real pipeline without an API server: insert the project in Supabase and
    // let the deployed worker drive it (Realtime carries status back). Falls
    // through to the preview engine when Supabase/auth isn't available.
    if (SUPABASE_ENABLED) {
      const sup = new SupabaseRun(cfg, onUpdate);
      runRef.current = sup;
      try {
        await sup.start();
        return;
      } catch {
        sup.cancel();
      }
    }
    const r = new DemoRun(cfg, onUpdate);
    runRef.current = r;
    r.start();
  }

  function reset() {
    runRef.current?.cancel();
    setRunning(false);
    setState(null);
  }

  return { state, running, run, reset };
}
