"use client";

import { useEffect, useState } from "react";
import { loadDegradations, type DegradationRow } from "../lib/truth";
import { Status } from "./cf/primitives";

const TONE = { major: "danger", warning: "warn", info: "idle" } as const;
const LABEL = { major: "Missing", warning: "Reduced", info: "Note" } as const;

/**
 * What this production ran without (DirectorOS DOS-75): every gap the worker
 * recorded — clamped output, ignored reference, missing track, failed upscale
 * or translation — shown to the owner instead of hidden. Empty when nothing
 * was recorded (or before migration 0031 is applied).
 */
export function DegradationList({ projectId, refreshKey }: { projectId: string; refreshKey?: unknown }) {
  const [rows, setRows] = useState<DegradationRow[]>([]);
  useEffect(() => {
    let live = true;
    void loadDegradations(projectId).then((r) => live && setRows(r));
    return () => {
      live = false;
    };
  }, [projectId, refreshKey]);
  if (!rows.length) return null;
  // One line per distinct message (a gap repeated on many shots reads once, with a count).
  const groups = new Map<string, { row: DegradationRow; count: number }>();
  for (const r of rows) {
    const g = groups.get(`${r.code}|${r.message}`);
    if (g) g.count++;
    else groups.set(`${r.code}|${r.message}`, { row: r, count: 1 });
  }
  return (
    <section aria-label="What this production ran without" className="mb-8 border-t border-cf-fg">
      <div className="flex items-center justify-between border-b border-cf-line py-4">
        <span className="cf-label text-cf-fg">What this production ran without</span>
        <span className="cf-label">{rows.length} recorded</span>
      </div>
      <ol>
        {[...groups.values()].map(({ row, count }) => (
          <li key={row.id} className="grid gap-2 border-b border-cf-line py-3 md:grid-cols-[120px_1fr] md:items-baseline">
            <Status tone={TONE[row.severity]}>{LABEL[row.severity]}</Status>
            <p className="text-[13px] leading-relaxed">
              {row.message}
              {count > 1 && <span className="ml-2 font-mono text-[11px] text-cf-muted">×{count}</span>}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
