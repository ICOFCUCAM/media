/**
 * Futuristic ambient backdrops (2030 aesthetic) — pure CSS/SVG, no deps.
 * Layered behind hero/film sections to evoke a living generation engine.
 */

/** Drifting aurora nebula — the deep-space film-engine atmosphere. */
export function AuroraField({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden ${className}`} aria-hidden>
      <div className="cf-aurora absolute left-1/2 top-[-20%] h-[44rem] w-[70rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(99,102,241,0.30),rgba(217,70,239,0.16),transparent_70%)] blur-3xl" />
      <div className="cf-aurora absolute right-[-10%] top-[20%] h-[32rem] w-[40rem] rounded-full bg-[radial-gradient(closest-side,rgba(34,211,238,0.20),transparent_70%)] blur-3xl" style={{ animationDelay: "-8s" }} />
      <div className="cf-aurora absolute left-[-8%] bottom-[-10%] h-[30rem] w-[38rem] rounded-full bg-[radial-gradient(closest-side,rgba(16,185,129,0.16),transparent_70%)] blur-3xl" style={{ animationDelay: "-14s" }} />
    </div>
  );
}

/** Faint perspective grid floor — the holographic stage. */
export function GridFloor() {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-72 overflow-hidden [mask-image:linear-gradient(to_top,black,transparent)]" aria-hidden>
      <div
        className="absolute inset-x-[-50%] bottom-[-50%] h-[140%] origin-bottom"
        style={{
          transform: "perspective(420px) rotateX(58deg)",
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.10) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />
    </div>
  );
}

/** Rotating conic engine-core halo — sits behind a focal element. */
export function EngineCore({ size = 520 }: { size?: number }) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 -translate-x-1/2 -translate-y-1/2" aria-hidden style={{ width: size, height: size }}>
      <div
        className="cf-spin-slow absolute inset-0 rounded-full opacity-40 blur-2xl"
        style={{ background: "conic-gradient(from 0deg, transparent, rgba(99,102,241,0.5), transparent, rgba(217,70,239,0.5), transparent)" }}
      />
      <div
        className="cf-spin-rev absolute inset-8 rounded-full opacity-30 blur-xl"
        style={{ background: "conic-gradient(from 120deg, transparent, rgba(34,211,238,0.5), transparent)" }}
      />
    </div>
  );
}

/** Sparse star/particle field. Hidden on small screens to save paint cost. */
export function Starfield({ count = 40 }: { count?: number }) {
  const stars = Array.from({ length: count }, (_, i) => ({
    left: (i * 53) % 100,
    top: (i * 37) % 100,
    delay: (i % 7) * 0.4,
    size: (i % 3) + 1,
  }));
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 hidden overflow-hidden sm:block" aria-hidden>
      {stars.map((s, i) => (
        <span
          key={i}
          className="cf-shimmer absolute rounded-full bg-white/60"
          style={{ left: `${s.left}%`, top: `${s.top}%`, width: s.size, height: s.size, animationDelay: `${s.delay}s` }}
        />
      ))}
    </div>
  );
}
