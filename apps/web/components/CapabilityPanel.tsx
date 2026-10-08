"use client";

import { CAPABILITY_LABEL, STATUS_LABEL, useCapabilities } from "../lib/truth";
import { Status } from "./cf/primitives";

const TONE = { production_ready: "ok", experimental: "live", unavailable: "danger", disabled: "idle", not_implemented: "idle" } as const;

/** Live Capability Registry (DOS-77): what the worker reports as operational now. */
export function CapabilityPanel() {
  const caps = useCapabilities();
  if (caps.state !== "loaded") {
    return (
      <p className="cf-label leading-relaxed">
        Live capabilities unavailable ({caps.reason}). Until the worker publishes them (migration 0031), nothing on this page
        is a statement that a feature works right now.
      </p>
    );
  }
  return (
    <ol className="border-t border-cf-fg">
      {caps.rows
        .slice()
        .sort((a, b) => Number(b.real_execution) - Number(a.real_execution) || a.capability.localeCompare(b.capability))
        .map((c) => (
          <li key={c.capability} className="grid gap-2 border-b border-cf-line py-3 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <span className="font-display font-semibold text-[16px]">{CAPABILITY_LABEL[c.capability] ?? c.capability}</span>
              <span className="ml-2 font-mono text-[11px] text-cf-muted">{c.provider ?? "—"}{c.supports.length ? ` · ${c.supports.join(" ")}` : ""}</span>
              {c.note && <p className="mt-1 text-[12px] leading-relaxed text-cf-muted">{c.note}</p>}
            </div>
            <Status tone={TONE[c.status]}>{STATUS_LABEL[c.status]}</Status>
          </li>
        ))}
    </ol>
  );
}
