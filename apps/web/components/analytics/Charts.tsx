"use client";

/** Dependency-free analytics primitives shared by the analytics desks. */

export function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-cf-bg p-6">
      <div className="cf-label">{label}</div>
      <div className="cf-display mt-7 text-[clamp(30px,3.2vw,48px)] leading-none">{value}</div>
      {sub && <div className="mt-2 text-[11px] text-cf-muted">{sub}</div>}
    </div>
  );
}

/** A ruled row of measures. */
export function Measures({ children, cols = 3 }: { children: React.ReactNode; cols?: 3 | 4 }) {
  return <div className={`grid gap-px border border-cf-line bg-cf-line sm:grid-cols-2 ${cols === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>{children}</div>;
}

export interface Bar {
  label: string;
  value: number;
}

/** Vertical bar chart — CSS only, hairline baseline, values in the title + an sr-only table. */
export function BarChart({ bars, unit }: { bars: Bar[]; unit?: string }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  if (bars.every((b) => b.value === 0)) return <p className="cf-label flex h-44 items-center justify-center">No activity in this window yet.</p>;
  return (
    <figure>
      <div className="flex h-44 items-end gap-1 border-b border-cf-fg" aria-hidden>
        {bars.map((b, i) => (
          <div key={i} className="group flex h-full flex-1 items-end" title={`${b.label}: ${b.value.toLocaleString()}${unit ? ` ${unit}` : ""}`}>
            <div className="w-full bg-cf-fg/80 transition group-hover:bg-cf-accent" style={{ height: `${Math.max(1, Math.round((b.value / max) * 100))}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-2 hidden gap-1 sm:flex" aria-hidden>
        {bars.map((b, i) => (
          <span key={i} className="flex-1 text-center font-mono text-[8px] text-cf-muted">
            {b.label}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <tbody>
          {bars.map((b) => (
            <tr key={b.label}>
              <th>{b.label}</th>
              <td>
                {b.value} {unit}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Ranked rows with proportional hairline fills. */
export function RankList({ rows, unit }: { rows: { label: string; value: number }[]; unit?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0 || rows.every((r) => r.value === 0))
    return <p className="cf-label py-8 text-center">No data yet — it appears as soon as you create and publish.</p>;
  return (
    <ol className="border-t border-cf-line">
      {rows.map((r, i) => (
        <li key={r.label} className="grid grid-cols-[36px_1fr_auto] items-center gap-3 border-b border-cf-line py-3">
          <span className="font-mono text-[9px] text-cf-muted">{String(i + 1).padStart(2, "0")}</span>
          <span className="min-w-0">
            <span className="block truncate font-serif text-[16px]">{r.label}</span>
            <span className="mt-1.5 block h-[2px] bg-cf-line">
              <span className="block h-full bg-cf-fg" style={{ width: `${(r.value / max) * 100}%` }} />
            </span>
          </span>
          <span className="font-mono text-[10px]">
            {r.value.toLocaleString()}
            {unit ? ` ${unit}` : ""}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-cf-fg pt-5">
      <h2 className="cf-label mb-6 text-cf-fg">{title}</h2>
      {children}
    </section>
  );
}
