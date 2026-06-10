"use client";

/** Dependency-free analytics primitives shared by the analytics sections. */

export function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="text-[11px] uppercase tracking-wider text-white/40">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-white/45">{sub}</div>}
    </div>
  );
}

export interface Bar {
  label: string;
  value: number;
}

/** Simple vertical bar chart — CSS only, tooltips via title attr. */
export function BarChart({ bars, unit }: { bars: Bar[]; unit?: string }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <div className="flex h-36 items-end gap-1">
      {bars.map((b, i) => (
        <div key={i} className="group flex flex-1 flex-col items-center gap-1" title={`${b.label}: ${b.value.toLocaleString()}${unit ? ` ${unit}` : ""}`}>
          <div
            className="w-full rounded-t bg-indigo-400/50 transition group-hover:bg-indigo-300"
            style={{ height: `${Math.max(2, Math.round((b.value / max) * 100))}%` }}
          />
          <span className="hidden text-[9px] text-white/30 sm:block">{b.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Horizontal ranked list with proportional fills. */
export function RankList({ rows, unit }: { rows: { label: string; value: number }[]; unit?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="mb-0.5 flex justify-between text-xs">
            <span className="truncate text-white/70">{r.label}</span>
            <span className="text-white/45">
              {r.value.toLocaleString()}
              {unit ? ` ${unit}` : ""}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
            <div className="h-full rounded-full bg-emerald-400/60" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
      <h2 className="mb-4 text-sm font-semibold text-white/70">{title}</h2>
      {children}
    </div>
  );
}
