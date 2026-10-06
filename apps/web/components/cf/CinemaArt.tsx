import type { ReactNode } from "react";

/*
 * CinemaArt — generated film stills for cards that would otherwise be empty.
 * Pure SVG, deterministic per seed (same title → same frame), no assets, safe
 * in server and client components. It illustrates; it never pretends to be a
 * render — wherever real footage exists (thumbnails, showcase films), use it.
 */

export type Scene = "kingdom" | "city" | "sea" | "savannah" | "forest" | "stage" | "studio" | "space" | "interior" | "figure";

export const SCENES: Scene[] = ["kingdom", "city", "sea", "savannah", "forest", "stage", "studio", "space", "interior", "figure"];

/** Words in a brief or title that call for a particular kind of frame. */
const KEYWORDS: [RegExp, Scene][] = [
  [/king|queen|empire|throne|citadel|castle|independence|dynasty|war/i, "kingdom"],
  [/city|cyber|neon|noir|megacity|metro|street|detective|heist|lagos/i, "city"],
  [/sea|ocean|ship|island|coast|beach|harbou?r|river/i, "sea"],
  [/savannah|desert|africa|safari|plain|sahara|drought/i, "savannah"],
  [/forest|jungle|wood|mountain|valley|wild/i, "forest"],
  [/music|concert|song|band|stage|dance|perform/i, "stage"],
  [/advert|brand|product|commercial|launch|campaign|promo|logo/i, "studio"],
  [/space|planet|galaxy|station|sci-?fi|orbit|star/i, "space"],
  [/palace|hall|room|church|interior|court|library/i, "interior"],
  [/portrait|character|hero|heroine|actor|cast|voice/i, "figure"],
];

export function sceneFor(text: string): Scene {
  for (const [re, scene] of KEYWORDS) if (re.test(text)) return scene;
  return SCENES[hash(text) % SCENES.length]!;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Small seeded PRNG so layouts vary per title but never between renders. */
function rng(seed: number) {
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PALETTES: Record<Scene, [string, string, string, string][]> = {
  // [sky top, sky horizon, light, ground]
  kingdom: [["#2a1a2e", "#e08a4a", "#ffd79a", "#1a120e"], ["#1d2333", "#c96a3c", "#ffcf8a", "#140f0c"]],
  city: [["#070b18", "#2b2350", "#ff4fa0", "#06070c"], ["#05101a", "#123b4a", "#46e0ff", "#04080b"]],
  sea: [["#13203a", "#e3875a", "#ffd2a0", "#0b1726"], ["#0e1b2c", "#7aa6c4", "#fff1d6", "#09121d"]],
  savannah: [["#3a1d10", "#f2a541", "#ffe2a0", "#2a1708"], ["#2d1a12", "#e97c3a", "#ffd18a", "#1f1209"]],
  forest: [["#0c1a17", "#3f6b5c", "#d8f0c8", "#07110e"], ["#101a12", "#6d8a52", "#f0f6c8", "#0a120b"]],
  stage: [["#09060f", "#36124a", "#d8ff43", "#050308"], ["#0a0708", "#4a1020", "#ffb04a", "#060304"]],
  studio: [["#121212", "#2d2a26", "#f6f1e6", "#0b0b0b"], ["#0f1214", "#2a3236", "#e8f6ff", "#090b0c"]],
  space: [["#03040a", "#151a3a", "#9fd3ff", "#020306"], ["#050307", "#2a1430", "#ffb38a", "#030204"]],
  interior: [["#1a120c", "#5a3a22", "#ffd9a0", "#0f0a07"], ["#0d1014", "#33404a", "#dbe8f2", "#08090b"]],
  figure: [["#140c0a", "#6a3a24", "#ffcf9a", "#0a0605"], ["#0b0f14", "#28485a", "#bfe6ff", "#06080a"]],
};

export function CinemaArt({
  seed,
  scene,
  className = "",
  hud,
  letterbox = false,
  motion = false,
  children,
}: {
  /** Title / brief / id — the same seed always draws the same frame. */
  seed: string;
  scene?: Scene;
  className?: string;
  /** Viewfinder overlay: a slug bottom-left and a timecode bottom-right. */
  hud?: { slug?: string; tag?: string } | boolean;
  letterbox?: boolean;
  /** A slow push-in (off under reduced motion). */
  motion?: boolean;
  children?: ReactNode;
}) {
  const s = scene ?? sceneFor(seed);
  const h = hash(seed + s);
  const r = rng(h);
  const pal = PALETTES[s][h % PALETTES[s].length]!;
  const id = `cfa${h.toString(36)}`;
  const tc = `00:0${Math.floor(r() * 9)}:${String(Math.floor(r() * 59)).padStart(2, "0")}:${String(Math.floor(r() * 23)).padStart(2, "0")}`;
  const hudCfg = hud === true ? {} : hud || null;

  return (
    <div className={`relative overflow-hidden bg-black ${className}`}>
      <svg
        viewBox="0 0 1600 900"
        preserveAspectRatio="xMidYMid slice"
        className={`absolute inset-0 h-full w-full ${motion ? "cf-pushin" : ""}`}
        role="img"
        aria-label={`Illustration: ${s} scene`}
      >
        <defs>
          <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={pal[0]} />
            <stop offset="0.72" stopColor={pal[1]} />
            <stop offset="1" stopColor={pal[3]} />
          </linearGradient>
          <radialGradient id={`${id}g`} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor={pal[2]} stopOpacity="0.95" />
            <stop offset="0.35" stopColor={pal[2]} stopOpacity="0.35" />
            <stop offset="1" stopColor={pal[2]} stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${id}v`} cx="0.5" cy="0.5" r="0.75">
            <stop offset="0.55" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.75" />
          </radialGradient>
          <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={pal[2]} stopOpacity="0.5" />
            <stop offset="1" stopColor={pal[2]} stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect width="1600" height="900" fill={`url(#${id}s)`} />
        <SceneBody scene={s} r={r} pal={pal} id={id} />
        <rect width="1600" height="900" fill={`url(#${id}v)`} />
      </svg>

      {/* Film grain */}
      <div className="cf-grain pointer-events-none absolute inset-0 opacity-[0.14] mix-blend-overlay" aria-hidden />
      {letterbox && (
        <>
          <div className="absolute inset-x-0 top-0 h-[9%] bg-black" aria-hidden />
          <div className="absolute inset-x-0 bottom-0 h-[9%] bg-black" aria-hidden />
        </>
      )}
      {hudCfg && (
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3 text-[10px] font-medium uppercase tracking-[0.08em] text-white/80 [text-shadow:0_1px_6px_rgba(0,0,0,.7)]">
          <div className="flex justify-between">
            {hudCfg.tag ? <span className="rounded-sm border border-white/30 bg-black/30 px-1.5 py-0.5">{hudCfg.tag}</span> : <span />}
            <span className="font-mono">{tc}</span>
          </div>
          {hudCfg.slug && <span className="truncate">{hudCfg.slug}</span>}
        </div>
      )}
      {children && <div className="absolute inset-0">{children}</div>}
    </div>
  );
}

/* ── Scenes ──────────────────────────────────────────────────── */

function SceneBody({ scene, r, pal, id }: { scene: Scene; r: () => number; pal: [string, string, string, string]; id: string }) {
  const [, , light, ground] = pal;
  const glow = `url(#${id}g)`;
  const sunX = 300 + r() * 1000;

  switch (scene) {
    case "kingdom": {
      const towers = Array.from({ length: 9 }, (_, i) => ({ x: 480 + i * 70 + r() * 30, h: 120 + r() * 220, w: 34 + r() * 30 }));
      return (
        <g>
          <circle cx={sunX} cy={560} r={260} fill={glow} />
          <circle cx={sunX} cy={560} r={70} fill={light} opacity="0.9" />
          <Ridge y={600} amp={70} r={r} fill={ground} opacity={0.55} />
          <g fill={ground}>
            {towers.map((t, i) => (
              <g key={i}>
                <rect x={t.x} y={700 - t.h} width={t.w} height={t.h + 60} />
                <path d={`M${t.x - 6} ${700 - t.h} L${t.x + t.w / 2} ${640 - t.h - r() * 40} L${t.x + t.w + 6} ${700 - t.h} Z`} />
              </g>
            ))}
            <rect x={440} y={640} width={720} height={120} />
          </g>
          <Ridge y={760} amp={40} r={r} fill={ground} opacity={1} />
          <Birds r={r} color={ground} />
        </g>
      );
    }
    case "city": {
      const blocks = Array.from({ length: 22 }, (_, i) => ({ x: i * 76 - 20 + r() * 20, h: 160 + r() * 420, w: 60 + r() * 40 }));
      return (
        <g>
          <circle cx={sunX} cy={180} r={160} fill={glow} opacity="0.7" />
          <circle cx={sunX} cy={180} r={34} fill={light} opacity="0.9" />
          <g fill={ground}>
            {blocks.map((b, i) => (
              <rect key={i} x={b.x} y={900 - b.h} width={b.w} height={b.h} />
            ))}
          </g>
          <g fill={light}>
            {blocks.flatMap((b, i) =>
              Array.from({ length: 14 }, (_, k) =>
                r() > 0.7 ? <rect key={`${i}-${k}`} x={b.x + 8 + (k % 3) * 18} y={900 - b.h + 20 + Math.floor(k / 3) * 34} width={8} height={12} opacity={0.5 + r() * 0.5} /> : null,
              ),
            )}
          </g>
          <rect y={600} width="1600" height="300" fill={`url(#${id}b)`} opacity="0.25" />
          <g stroke={light} strokeOpacity="0.18" strokeWidth="2">
            {Array.from({ length: 40 }, (_, i) => {
              const x = r() * 1600;
              const y = r() * 900;
              return <line key={i} x1={x} y1={y} x2={x - 12} y2={y + 60} />;
            })}
          </g>
        </g>
      );
    }
    case "sea": {
      return (
        <g>
          <circle cx={sunX} cy={520} r={300} fill={glow} />
          <circle cx={sunX} cy={520} r={80} fill={light} />
          <rect y={520} width="1600" height="380" fill={ground} />
          <g fill={light}>
            {Array.from({ length: 16 }, (_, i) => (
              <rect key={i} x={sunX - 160 + r() * 320 - i * 4} y={540 + i * 22} width={60 + r() * 140 - i * 4} height="4" opacity={0.7 - i * 0.04} />
            ))}
          </g>
          <g fill={ground} transform={`translate(${200 + r() * 900} 470)`}>
            <path d="M0 50 L180 50 L160 72 L20 72 Z" />
            <rect x="80" y="-60" width="6" height="110" />
            <path d="M88 -56 L150 30 L88 30 Z" opacity="0.9" />
          </g>
          <Birds r={r} color={ground} />
        </g>
      );
    }
    case "savannah": {
      return (
        <g>
          <circle cx={sunX} cy={600} r={320} fill={glow} />
          <circle cx={sunX} cy={600} r={110} fill={light} opacity="0.95" />
          <Ridge y={690} amp={20} r={r} fill={ground} opacity={1} />
          {Array.from({ length: 3 }, (_, i) => (
            <Acacia key={i} x={160 + i * 520 + r() * 200} y={700} s={0.8 + r() * 0.7} fill={ground} />
          ))}
          <Birds r={r} color={ground} />
        </g>
      );
    }
    case "forest": {
      return (
        <g>
          <circle cx={sunX} cy={260} r={260} fill={glow} opacity="0.6" />
          {[0.35, 0.55, 0.8, 1].map((o, layer) => (
            <g key={layer} fill={ground} opacity={o}>
              {Array.from({ length: 18 }, (_, i) => {
                const x = i * 95 + r() * 60 - 40;
                const base = 520 + layer * 110;
                const hgt = 160 + r() * 160 + layer * 40;
                return <path key={i} d={`M${x} ${base} L${x + 45} ${base - hgt} L${x + 90} ${base} Z`} />;
              })}
              <rect y={520 + layer * 110} width="1600" height="400" />
            </g>
          ))}
          <rect y={430} width="1600" height="90" fill={light} opacity="0.08" />
        </g>
      );
    }
    case "stage": {
      return (
        <g>
          {Array.from({ length: 5 }, (_, i) => {
            const x = 200 + i * 300 + r() * 60;
            return <path key={i} d={`M${x} 0 L${x - 160 - r() * 80} 900 L${x + 160 + r() * 80} 900 Z`} fill={`url(#${id}b)`} opacity="0.55" />;
          })}
          <circle cx={800} cy={460} r={220} fill={glow} opacity="0.6" />
          <Figure x={800} y={560} s={1.1} fill={ground} />
          <rect y={640} width="1600" height="40" fill={ground} />
          <g fill={ground}>
            {Array.from({ length: 34 }, (_, i) => (
              <circle key={i} cx={i * 48 + r() * 20} cy={820 + r() * 30} r={30 + r() * 12} />
            ))}
            <rect y={830} width="1600" height="80" />
          </g>
        </g>
      );
    }
    case "studio": {
      return (
        <g>
          <circle cx={1000} cy={420} r={360} fill={glow} opacity="0.55" />
          <rect x={1060} y={160} width={300} height={220} fill={light} opacity="0.85" />
          <rect x={1196} y={380} width={8} height={420} fill={ground} />
          <g fill={ground}>
            <rect x={300} y={430} width={260} height={160} rx={10} />
            <circle cx={340} cy={410} r={46} />
            <circle cx={470} cy={410} r={46} />
            <rect x={560} y={480} width={110} height={60} />
            <path d="M420 590 L320 840 M430 590 L430 840 M440 590 L540 840" stroke={ground} strokeWidth="12" />
          </g>
          <rect x={720} y={520} width={220} height={260} rx={14} fill={ground} opacity="0.9" />
          <rect y={800} width="1600" height="100" fill={ground} />
        </g>
      );
    }
    case "space": {
      return (
        <g>
          <g fill="#fff">
            {Array.from({ length: 160 }, (_, i) => (
              <circle key={i} cx={r() * 1600} cy={r() * 900} r={r() * 2.2} opacity={0.3 + r() * 0.7} />
            ))}
          </g>
          <circle cx={1200} cy={1180} r={720} fill={ground} />
          <circle cx={1200} cy={1180} r={720} fill="none" stroke={light} strokeOpacity="0.5" strokeWidth="6" />
          <circle cx={sunX * 0.6} cy={260} r={180} fill={glow} opacity="0.7" />
          <g fill={ground} transform={`translate(${300 + r() * 400} 360) rotate(-12)`}>
            <rect x="0" y="0" width="240" height="40" rx="8" />
            <rect x="90" y="-60" width="60" height="160" rx="6" />
            <rect x="-120" y="10" width="110" height="20" />
            <rect x="250" y="10" width="110" height="20" />
          </g>
        </g>
      );
    }
    case "interior": {
      return (
        <g>
          <rect width="1600" height="900" fill={ground} opacity="0.6" />
          {Array.from({ length: 5 }, (_, i) => {
            const x = 140 + i * 320;
            return (
              <g key={i}>
                <rect x={x} y={120} width={150} height={420} rx={75} fill={light} opacity="0.35" />
                <path d={`M${x} 540 L${x - 120} 900 L${x + 270} 900 L${x + 150} 540 Z`} fill={`url(#${id}b)`} opacity="0.35" />
                <rect x={x + 205} y={80} width={50} height={820} fill={ground} />
              </g>
            );
          })}
          <rect x={700} y={500} width={200} height={260} fill={ground} />
          <Figure x={800} y={560} s={0.9} fill={ground} />
          <rect y={760} width="1600" height="140" fill={ground} />
        </g>
      );
    }
    case "figure":
    default: {
      return (
        <g>
          <circle cx={800 + (r() - 0.5) * 200} cy={360} r={360} fill={glow} />
          <Figure x={800} y={520} s={2.6} fill={ground} rim={light} />
          <rect y={860} width="1600" height="40" fill={ground} />
        </g>
      );
    }
  }
}

function Ridge({ y, amp, r, fill, opacity }: { y: number; amp: number; r: () => number; fill: string; opacity: number }) {
  const pts = Array.from({ length: 11 }, (_, i) => `${i * 160},${y - r() * amp}`).join(" L");
  return <path d={`M0 900 L${pts} L1600 900 Z`} fill={fill} opacity={opacity} />;
}

function Birds({ r, color }: { r: () => number; color: string }) {
  return (
    <g stroke={color} strokeWidth="4" fill="none" strokeLinecap="round">
      {Array.from({ length: 5 }, (_, i) => {
        const x = 200 + r() * 1200;
        const y = 120 + r() * 220;
        const s = 10 + r() * 10;
        return <path key={i} d={`M${x - s} ${y} Q${x - s / 2} ${y - s / 1.5} ${x} ${y} Q${x + s / 2} ${y - s / 1.5} ${x + s} ${y}`} />;
      })}
    </g>
  );
}

function Acacia({ x, y, s, fill }: { x: number; y: number; s: number; fill: string }) {
  return (
    <g fill={fill} transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M-6 0 L-4 -150 L4 -150 L6 0 Z" />
      <path d="M-2 -120 L-70 -175 M2 -120 L80 -180" stroke={fill} strokeWidth="8" />
      <ellipse cx="0" cy="-190" rx="170" ry="34" />
    </g>
  );
}

function Figure({ x, y, s, fill, rim }: { x: number; y: number; s: number; fill: string; rim?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {rim && (
        <g fill="none" stroke={rim} strokeOpacity="0.55" strokeWidth="3">
          <circle cx="0" cy="-118" r="44" />
          <path d="M-96 140 Q-92 -40 -26 -62 L26 -62 Q92 -40 96 140" />
        </g>
      )}
      <g fill={fill}>
        <circle cx="0" cy="-118" r="44" />
        <path d="M-96 140 Q-92 -40 -26 -62 L26 -62 Q92 -40 96 140 Z" />
        <rect x="-14" y="-80" width="28" height="22" />
      </g>
    </g>
  );
}
