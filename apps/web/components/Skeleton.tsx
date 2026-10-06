/** Shared loading skeletons — ruled placeholders instead of "Loading…" text. */

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="border-t border-cf-line" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse border-b border-cf-line bg-cf-soft/50" />
      ))}
    </div>
  );
}

export function SkeletonCards({ cards = 4, cols = "sm:grid-cols-2" }: { cards?: number; cols?: string }) {
  return (
    <div className={`grid gap-px border border-cf-line bg-cf-line ${cols}`} aria-busy="true" aria-label="Loading">
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="h-32 animate-pulse bg-cf-soft/60" />
      ))}
    </div>
  );
}
