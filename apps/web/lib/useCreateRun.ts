"use client";

import { useRef, useState } from "react";
import { DemoRun, type DemoState } from "./demo";
import { LiveRun } from "./live";
import { IS_LIVE } from "./system";

export interface RunConfig {
  prompt: string;
  modelId: string;
  targetSeconds: number;
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
      if (s.status === "READY") setRunning(false);
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
