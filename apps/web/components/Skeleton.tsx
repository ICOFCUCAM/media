/** Shared loading skeletons — shimmer placeholders instead of "Loading…" text. */

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-xl border border-white/5 bg-white/[0.03]" />
      ))}
    </div>
  );
}

export function SkeletonCards({ cards = 4, cols = "sm:grid-cols-2" }: { cards?: number; cols?: string }) {
  return (
    <div className={`grid gap-3 ${cols}`}>
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="h-32 animate-pulse rounded-xl border border-white/5 bg-white/[0.03]" />
      ))}
    </div>
  );
}
