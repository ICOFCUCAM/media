/*
 * The CineForge master shot — EXT. ASHÉRON-KOR — DAWN.
 * A hand-built SVG frame for the hero (and, reframed, for Release): a
 * Sudano-Sahelian citadel backlit by dawn, a central spire carrying a ring of
 * light, sky craft, haze, and a queen with her guard on the ridge in the
 * foreground. It is illustration — real featured films replace it in the hero.
 */

const W = 1600;
const H = 900;

/** Deterministic dust motes (no Math.random — identical on server and client). */
const DUST = Array.from({ length: 70 }, (_, i) => {
  const a = (i * 9301 + 49297) % 233280;
  const b = (i * 4271 + 1013) % 9973;
  return { x: (a / 233280) * W, y: 380 + (b / 9973) * 480, r: 0.6 + ((i * 37) % 10) / 6, o: 0.15 + ((i * 53) % 10) / 22 };
});

/** Lower town on the citadel hill — deterministic so SSR and client agree. */
const TOWN = Array.from({ length: 64 }, (_, i) => {
  const t = ((i * 7919) % 1000) / 1000;
  const x = 600 + t * 900;
  const hillTop = 612 + Math.pow((x - 1050) / 470, 2) * 70;
  const y = hillTop + ((i * 131) % 60);
  return { x, y, w: 10 + ((i * 17) % 14), h: 8 + ((i * 29) % 12), lit: i % 5 === 0 };
});

/** A tapered mud-brick tower with a rounded crown and protruding toron beams. */
function Tower({ c, base, w, h, tw, beams = 4 }: { c: number; base: number; w: number; h: number; tw: number; beams?: number }) {
  const top = base - h;
  const rows = Array.from({ length: beams }, (_, i) => top + 30 + (i * (h - 50)) / beams);
  return (
    <g>
      <path d={`M${c - w / 2} ${base} L${c - tw / 2} ${top} Q${c} ${top - tw * 0.55} ${c + tw / 2} ${top} L${c + w / 2} ${base} Z`} />
      {rows.map((y) => {
        const half = tw / 2 + ((w - tw) / 2) * ((y - top) / h);
        return <path key={y} d={`M${c - half - 7} ${y} h10 M${c + half - 3} ${y} h10`} strokeWidth="2.4" stroke="#24130e" />;
      })}
    </g>
  );
}

/** A round granite tower with a conical roof (Great Zimbabwe lineage). */
function ConeTower({ c, base, w, h }: { c: number; base: number; w: number; h: number }) {
  return (
    <g>
      <rect x={c - w / 2} y={base - h} width={w} height={h} />
      <path d={`M${c - w / 2 - 6} ${base - h + 2} L${c} ${base - h - w * 1.1} L${c + w / 2 + 6} ${base - h + 2} Z`} />
    </g>
  );
}

/** A standing figure, feet at (x, y), height h. */
function Figure({ x, y, h, spear, shield }: { x: number; y: number; h: number; spear?: boolean; shield?: boolean }) {
  const s = h / 100;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <circle cx="0" cy="-90" r="7.5" />
      <path d="M-9 -80 L9 -80 L11 -45 L7 -44 L6 0 L1 0 L0 -40 L-1 0 L-6 0 L-7 -44 L-11 -45 Z" />
      {spear && <path d="M14 -118 L16 4" strokeWidth="2.2" stroke="currentColor" />}
      {spear && <path d="M14 -118 l-2.5 -10 l5 0 z" />}
      {shield && <ellipse cx="-12" cy="-58" rx="9" ry="16" />}
    </g>
  );
}

export function MasterShot({
  className = "",
  focus = "xMidYMid",
  idPrefix = "ms",
  view,
}: {
  className?: string;
  focus?: "xMidYMid" | "xMinYMid" | "xMaxYMid";
  /** Unique per instance on a page (SVG ids are global). */
  idPrefix?: string;
  /** A reframe window "x y w h" in the 1600×900 master — for adaptive crops. */
  view?: string;
}) {
  const p = idPrefix;
  return (
    <svg viewBox={view ?? `0 0 ${W} ${H}`} preserveAspectRatio={`${focus} slice`} className={className} role="img" aria-label="Ashéron-Kor at dawn: a citadel of tapered towers backlit by the sun, a queen and her guard on the ridge">
      <defs>
        <linearGradient id={`${p}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#100d1f" />
          <stop offset="0.34" stopColor="#3a2236" />
          <stop offset="0.58" stopColor="#93493a" />
          <stop offset="0.74" stopColor="#e18a52" />
          <stop offset="0.86" stopColor="#f4c487" />
          <stop offset="1" stopColor="#c8794a" />
        </linearGradient>
        <radialGradient id={`${p}-sun`} cx="1040" cy="500" r="560" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff6dc" />
          <stop offset="0.08" stopColor="#ffe0a3" stopOpacity="0.95" />
          <stop offset="0.3" stopColor="#ffab63" stopOpacity="0.45" />
          <stop offset="1" stopColor="#ff8a4a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${p}-haze`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffcf96" stopOpacity="0" />
          <stop offset="0.5" stopColor="#f2a96c" stopOpacity="0.55" />
          <stop offset="1" stopColor="#b8643c" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${p}-ground`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a1d14" />
          <stop offset="1" stopColor="#0b0605" />
        </linearGradient>
        <linearGradient id={`${p}-valley`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7a3a28" />
          <stop offset="0.35" stopColor="#4a2219" />
          <stop offset="1" stopColor="#1c0d09" />
        </linearGradient>
        <radialGradient id={`${p}-vignette`} cx="0.55" cy="0.5" r="0.75">
          <stop offset="0.55" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.72" />
        </radialGradient>
        <filter id={`${p}-b3`} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3" /></filter>
        <filter id={`${p}-b10`} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="10" /></filter>
        <filter id={`${p}-b28`} x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="28" /></filter>
        <filter id={`${p}-glow`} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="5" result="g" />
          <feMerge><feMergeNode in="g" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Sky, sun and the light coming through it */}
      <rect width={W} height={H} fill={`url(#${p}-sky)`} />
      <circle className="ms-sun" cx="1040" cy="500" r="560" fill={`url(#${p}-sun)`} />
      <circle cx="1040" cy="500" r="66" fill="#fff4d8" />
      <g className="ms-rays" opacity="0.16" fill="#ffe2b0" filter={`url(#${p}-b10)`}>
        <path d="M1040 500 L520 900 L690 900 Z" />
        <path d="M1040 500 L860 900 L960 900 Z" />
        <path d="M1040 500 L1180 900 L1330 900 Z" />
        <path d="M1040 500 L1460 900 L1600 860 Z" />
      </g>
      {/* High cloud bands */}
      <g className="ms-clouds" fill="#ffd2a0" opacity="0.18" filter={`url(#${p}-b10)`}>
        <ellipse cx="420" cy="250" rx="380" ry="16" />
        <ellipse cx="1240" cy="300" rx="420" ry="12" />
        <ellipse cx="900" cy="380" rx="520" ry="9" />
      </g>

      {/* Distant mesas, lost in atmosphere */}
      <path d="M0 610 L90 575 L170 590 L260 540 L380 556 L470 520 L590 548 L700 528 L820 560 L1260 560 L1340 520 L1450 536 L1530 506 L1600 520 L1600 900 L0 900 Z" fill="#a95f45" opacity="0.5" filter={`url(#${p}-b3)`} />
      <path d="M0 660 L140 630 L300 646 L460 618 L640 640 L1300 640 L1440 612 L1600 630 L1600 900 L0 900 Z" fill="#6e3428" opacity="0.75" />

      {/* Sky craft with light trails */}
      <g className="ms-craft">
        <path d="M250 300 L420 318" stroke="#ffe0a8" strokeOpacity="0.35" strokeWidth="1.2" />
        <ellipse cx="428" cy="319" rx="13" ry="3.2" fill="#2a1812" />
        <path d="M1330 210 L1460 196" stroke="#ffe0a8" strokeOpacity="0.3" strokeWidth="1" />
        <ellipse cx="1466" cy="195" rx="10" ry="2.6" fill="#2a1812" />
        <path d="M690 180 L760 186" stroke="#d8ff62" strokeOpacity="0.45" strokeWidth="1" />
        <ellipse cx="764" cy="186" rx="7" ry="2" fill="#2a1812" />
      </g>

      {/* Atmosphere behind the hill */}
      <rect x="0" y="560" width={W} height="130" fill={`url(#${p}-haze)`} opacity="0.8" filter={`url(#${p}-b28)`} />

      {/* Valley floor and the river catching the dawn */}
      <path d="M0 690 L1600 690 L1600 900 L0 900 Z" fill={`url(#${p}-valley)`} />
      <path d="M560 780 C760 760 900 800 1080 790 C1260 780 1420 820 1600 806" fill="none" stroke="#ffcf96" strokeOpacity="0.55" strokeWidth="5" filter={`url(#${p}-b3)`} />
      <path d="M560 780 C760 760 900 800 1080 790 C1260 780 1420 820 1600 806" fill="none" stroke="#fff0d0" strokeOpacity="0.6" strokeWidth="1.4" />

      {/* The citadel hill, terraced, with its lower town */}
      <path d="M520 800 C600 700 700 640 800 616 L1300 616 C1400 640 1500 700 1600 780 L1600 830 C1200 800 900 810 520 830 Z" fill="#33180f" />
      <path d="M560 760 C620 690 700 640 800 616 L1300 616 C1400 640 1480 690 1560 760" fill="none" stroke="#ffb46c" strokeOpacity="0.4" strokeWidth="1.2" />
      <g fill="none" stroke="#5a2a1c" strokeWidth="2">
        <path d="M660 690 C760 660 900 648 1050 648 C1200 648 1340 660 1450 690" />
        <path d="M610 730 C760 700 900 690 1050 690 C1200 690 1360 700 1500 730" />
      </g>
      <g fill="#2b1611">
        {TOWN.map((h, i) => (
          <g key={i}>
            <rect x={h.x} y={h.y - h.h} width={h.w} height={h.h} rx="1.5" />
            {h.lit && <rect x={h.x + h.w / 2 - 1.5} y={h.y - h.h + 3} width="3" height="4" fill="#ffcf7a" />}
          </g>
        ))}
      </g>

      {/* The citadel — backlit, rim-lit on its edges */}
      <g fill="#2b1611" stroke="#ffb46c" strokeOpacity="0.55" strokeWidth="1.4">
        <Tower c={700} base={606} w={70} h={150} tw={34} beams={3} />
        <Tower c={790} base={604} w={84} h={210} tw={40} />
        <ConeTower c={872} base={604} w={44} h={120} />
        <Tower c={940} base={602} w={90} h={250} tw={42} />
        {/* The great spire, standing in front of the sun */}
        <Tower c={1040} base={602} w={120} h={360} tw={46} beams={6} />
        <Tower c={1140} base={602} w={92} h={260} tw={40} />
        <ConeTower c={1212} base={604} w={46} h={130} />
        <Tower c={1290} base={604} w={86} h={200} tw={38} />
        <Tower c={1380} base={606} w={66} h={140} tw={30} beams={3} />
        {/* Bridge of arches across the lower terraces */}
        <path d="M760 560 L1320 560 L1320 584 Q1290 568 1260 584 Q1230 568 1200 584 Q1170 568 1140 584 Q1110 568 1080 584 Q1050 568 1020 584 Q990 568 960 584 Q930 568 900 584 Q870 568 840 584 Q810 568 780 584 Q770 576 760 584 Z" />
      </g>
      {/* Light slit and ring of light on the spire */}
      <rect className="ms-slit" x="1038.5" y="276" width="3" height="250" fill="#e9ff9a" opacity="0.7" filter={`url(#${p}-glow)`} />
      <ellipse className="ms-ring" cx="1040" cy="236" rx="86" ry="15" fill="none" stroke="#ffd98a" strokeWidth="2.4" strokeDasharray="40 14" filter={`url(#${p}-glow)`} />
      <ellipse cx="1040" cy="236" rx="120" ry="22" fill="none" stroke="#ffd98a" strokeOpacity="0.35" strokeWidth="1" />
      {/* Lit windows */}
      <g fill="#ffcf7a">
        {[[792, 470], [792, 520], [940, 430], [944, 500], [1140, 450], [1136, 520], [1290, 500], [700, 540], [1380, 540], [880, 560], [1210, 560], [1040, 560], [1000, 590], [1080, 590]].map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x - 3} y={y - 5} width="6" height="9" rx="1" opacity="0.9" />
        ))}
      </g>

      {/* Birds over the valley */}
      <g fill="none" stroke="#2a1510" strokeWidth="2" strokeLinecap="round" opacity="0.8">
        <path d="M560 300 q8 -8 16 0 q8 -8 16 0" />
        <path d="M610 270 q6 -6 12 0 q6 -6 12 0" />
        <path d="M1180 330 q7 -7 14 0 q7 -7 14 0" />
      </g>


      {/* Foreground ridge */}
      <path d="M0 900 L0 712 C110 694 210 688 330 700 C430 708 520 716 600 736 C680 756 740 800 790 900 Z" fill={`url(#${p}-ground)`} />
      <path d="M0 712 C110 694 210 688 330 700 C430 708 520 716 600 736" fill="none" stroke="#ffb46c" strokeOpacity="0.45" strokeWidth="1.6" />

      {/* The queen and her guard, rim-lit */}
      <g fill="#140b08" stroke="#ffb46c" strokeOpacity="0.6" strokeWidth="1" color="#140b08">
        {/* War banner */}
        <path d="M206 704 L210 548" stroke="#140b08" strokeWidth="3.2" />
        <path d="M210 552 C240 540 262 562 292 552 C284 572 290 588 296 598 C268 606 244 586 210 598 Z" fill="#7d1e17" className="ms-banner" />
        <Figure x={250} y={706} h={92} spear shield />
        <Figure x={420} y={712} h={96} spear shield />
        <Figure x={470} y={716} h={88} spear />
        {/* The queen: headwrap, gold collar, wind-blown cape, staff of light */}
        <g>
          <path d="M322 598 C298 612 266 644 230 702 C258 694 288 698 318 704 C318 662 322 630 330 606 Z" fill="#5a1612" />
          <path d="M323 596 C320 622 317 652 310 703 L362 705 C357 660 352 624 348 596 C341 589 330 589 323 596 Z" />
          <ellipse cx="335.5" cy="597" rx="15" ry="5" fill="#7a5422" />
          <circle cx="335" cy="580" r="9.5" />
          <path d="M325 577 C317 560 324 538 343 536 C362 536 364 556 351 571 C346 577 340 575 335 573 Z" />
          <path d="M364 534 L368 705" stroke="#140b08" strokeWidth="3" />
          <circle cx="364" cy="530" r="6.5" fill="none" stroke="#ffcf7a" strokeWidth="1.6" />
        </g>
      </g>
      {/* Grass on the ridge */}
      <g stroke="#140b08" strokeWidth="1.6" strokeLinecap="round">
        {Array.from({ length: 34 }, (_, i) => {
          const x = 20 + i * 17 + ((i * 7) % 9);
          const y = 712 - Math.sin((x / 600) * Math.PI) * 18 + (x > 450 ? (x - 450) * 0.14 : 0);
          return <path key={i} d={`M${x} ${y} q${2 + (i % 3)} -${10 + (i % 5) * 3} ${5 + (i % 4)} -${14 + (i % 6) * 3}`} fill="none" />;
        })}
      </g>
      <circle cx="364" cy="530" r="3.5" fill="#e9ff9a" filter={`url(#${p}-glow)`} />

      {/* Dust in the light */}
      <g className="ms-dust" fill="#ffe2b0">
        {DUST.map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r={d.r} opacity={d.o} />
        ))}
      </g>

      <rect width={W} height={H} fill={`url(#${p}-vignette)`} />
    </svg>
  );
}
