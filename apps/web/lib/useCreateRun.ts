"use client";

import { useRef, useState } from "react";
import { DemoRun, type DemoState } from "./demo";
import { SupabaseRun } from "./supabase-run";
import { SUPABASE_ENABLED } from "./supabase";
import type { ProductionSpec } from "./production-types";

export interface RunConfig {
  prompt: string;
  modelId: string;
  targetSeconds: number;
  /** Output format ("480p"…"4k") — plan-classified in the UI. */
  resolution?: string;
  /** Placement aspect ("16:9", "9:16", "1:1", "4:5"). Persisted: the worker
   *  generates at this shape (it used to be shown only, then made at 16:9). */
  aspectRatio?: string;
  /** "three": review the story and each storyboard before any video (W8b). */
  passMode?: "single" | "three";
  /** What is being made (W11; Part 5): format, medium, animation style, episodes — data, not prompt words. */
  production?: ProductionSpec;
  /** Character Cards cast into the production (W12; Part 5 §183 "Use character"). */
  castIds?: string[];
  /** The production's title (defaults to the brief's opening). */
  title?: string;
}

/** Shared generation runner — the real pipeline through Supabase when signed
 *  in, else the preview engine. Every create surface composes its own controls around it. */
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
    // The real pipeline: insert the project in Supabase and let the deployed
    // worker drive it (Supabase Realtime carries status back). Falls through
    // to the preview engine when Supabase/auth isn't available.
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
