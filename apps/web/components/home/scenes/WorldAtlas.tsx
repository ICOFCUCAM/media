/*
 * World chapter — the world bible as a cartographic atlas: topographic
 * contours, a river to the coast, the Salt Road, and the production's named
 * locations. A different visual language from the painterly hero on purpose:
 * this is the world being built, not a shot from it.
 */

const S = 1000;

const frac = (v: number) => v - Math.floor(v);

/** Irregular closed contour around (cx, cy) — deterministic harmonics. */
function contour(cx: number, cy: number, r: number, k: number) {
  const pts: string[] = [];
  for (let i = 0; i <= 72; i++) {
    const t = (i / 72) * Math.PI * 2;
    const rr = r * (1 + 0.14 * Math.sin(3 * t + k) + 0.08 * Math.cos(5 * t - k * 0.7) + 0.04 * Math.sin(9 * t + k * 1.3));
    pts.push(`${(cx + rr * Math.cos(t)).toFixed(1)} ${(cy + rr * 0.78 * Math.sin(t)).toFixed(1)}`);
  }
  return `M${pts.join(" L")} Z`;
}

const PEAKS = [
  { cx: 290, cy: 270, rings: 9, step: 22, k: 0.4 },
  { cx: 470, cy: 640, rings: 6, step: 20, k: 1.7 },
  { cx: 150, cy: 520, rings: 5, step: 18, k: 2.6 },
];

const LOCATIONS = [
  { x: 575, y: 410, name: "Ashéron-Kor", sub: "Capital · Acts I & III", capital: true, dx: 22, dy: -18 },
  { x: 300, y: 262, name: "Kora Range", sub: "The exile · Act II", dx: 22, dy: -12 },
  { x: 205, y: 805, name: "Red Dunes", sub: "Salt caravans", dx: 18, dy: 6 },
  { x: 792, y: 690, name: "Ima Coast", sub: "The landing · Act III", dx: -150, dy: 34 },
];

export function WorldAtlas({ className = "" }: { className?: string }) {
  return (
    <svg viewBox={`0 0 ${S} ${S}`} preserveAspectRatio="xMidYMid slice" className={className} role="img" aria-label="World bible atlas: the Kora Range, the capital Ashéron-Kor, the Red Dunes and the Ima Coast, joined by the Salt Road and a river to the sea">
      <defs>
        <pattern id="wa-sea" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <path d="M0 0 V14" stroke="#16323e" strokeWidth="1.2" />
        </pattern>
        <radialGradient id="wa-land" cx="0.35" cy="0.4" r="0.8">
          <stop offset="0" stopColor="#1b2422" />
          <stop offset="1" stopColor="#0f1514" />
        </radialGradient>
        <filter id="wa-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="g" />
          <feMerge><feMergeNode in="g" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Sea */}
      <rect width={S} height={S} fill="#0a1820" />
      <rect width={S} height={S} fill="url(#wa-sea)" opacity="0.7" />

      {/* Land and its coastline */}
      <path id="wa-coast" d="M0 0 H760 C722 120 806 196 764 300 C724 398 828 470 786 562 C742 652 866 724 824 822 C794 900 846 958 806 1000 H0 Z" fill="url(#wa-land)" />
      <path d="M760 0 C722 120 806 196 764 300 C724 398 828 470 786 562 C742 652 866 724 824 822 C794 900 846 958 806 1000" fill="none" stroke="#e9e1cf" strokeOpacity="0.55" strokeWidth="1.6" />
      <path d="M778 0 C740 120 824 196 782 300 C742 398 846 470 804 562 C760 652 884 724 842 822 C812 900 864 958 824 1000" fill="none" stroke="#e9e1cf" strokeOpacity="0.15" strokeWidth="1" />

      {/* Dunes */}
      <g fill="none" stroke="#6a4a2a" strokeOpacity="0.7" strokeWidth="1.2">
        {Array.from({ length: 11 }, (_, i) => (
          <path key={i} d={`M20 ${700 + i * 24} C80 ${688 + i * 24} 140 ${712 + i * 24} 200 ${700 + i * 24} S320 ${688 + i * 24} 380 ${704 + i * 24}`} />
        ))}
      </g>

      {/* Forest */}
      <g fill="#1d3226">
        {Array.from({ length: 90 }, (_, i) => {
          const x = 590 + frac(Math.sin(i * 12.9898) * 43758.5453) * 150;
          const y = 110 + frac(Math.sin(i * 78.233) * 24634.6345) * 210;
          return <circle key={i} cx={x} cy={y} r={3 + (i % 3)} />;
        })}
      </g>

      {/* Relief */}
      <g fill="none" stroke="#3d5d58">
        {PEAKS.flatMap((pk) =>
          Array.from({ length: pk.rings }, (_, i) => (
            <path key={`${pk.cx}-${i}`} d={contour(pk.cx, pk.cy, 18 + i * pk.step, pk.k + i * 0.15)} strokeOpacity={0.25 + (i % 3 === 0 ? 0.35 : 0)} strokeWidth={i % 3 === 0 ? 1.4 : 0.8} />
          )),
        )}
      </g>

      {/* Coordinate grid */}
      <g stroke="#e9e1cf" strokeOpacity="0.07">
        {[125, 250, 375, 500, 625, 750, 875].map((v) => (
          <g key={v}>
            <path d={`M${v} 0 V${S}`} />
            <path d={`M0 ${v} H${S}`} />
          </g>
        ))}
      </g>
      <g fill="#e9e1cf" fillOpacity="0.35" fontFamily="Inter, sans-serif" fontSize="11" letterSpacing="1">
        {["A", "B", "C", "D", "E", "F", "G"].map((l, i) => (
          <text key={l} x={125 * (i + 1) + 4} y="18">{l}</text>
        ))}
        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
          <text key={n} x="6" y={125 * n - 6}>{n}</text>
        ))}
      </g>

      {/* River from the range to the sea */}
      <path d="M318 330 C360 380 330 430 400 460 C470 490 520 470 560 520 C600 570 640 560 690 590 C730 614 760 600 790 580" fill="none" stroke="#4a95a8" strokeWidth="3.2" strokeLinecap="round" filter="url(#wa-glow)" opacity="0.9" />

      {/* The Salt Road */}
      <path d="M575 410 C520 520 430 560 360 640 C300 708 250 760 205 805" fill="none" stroke="#e8b45a" strokeWidth="2" strokeDasharray="7 7" strokeOpacity="0.85" />
      <text x="372" y="600" fill="#e8b45a" fontFamily="Inter, sans-serif" fontSize="12" letterSpacing="2.4" transform="rotate(-42 372 600)">THE SALT ROAD</text>

      {/* Locations */}
      {LOCATIONS.map((l) => (
        <g key={l.name}>
          {l.capital ? (
            <g filter="url(#wa-glow)">
              <rect x={l.x - 9} y={l.y - 9} width="18" height="18" fill="none" stroke="#d8ff62" strokeWidth="2" transform={`rotate(45 ${l.x} ${l.y})`} />
              <circle cx={l.x} cy={l.y} r="3.5" fill="#d8ff62" />
            </g>
          ) : (
            <circle cx={l.x} cy={l.y} r="5.5" fill="#0a1820" stroke="#e9e1cf" strokeWidth="1.8" />
          )}
          <text x={l.x + l.dx} y={l.y + l.dy} fill="#f2ede1" fontFamily="Manrope, Inter, sans-serif" fontSize={l.capital ? 22 : 17} fontWeight="700" letterSpacing="1.5">
            {l.name.toUpperCase()}
          </text>
          <text x={l.x + l.dx} y={l.y + l.dy + 18} fill="#e9e1cf" fillOpacity="0.6" fontFamily="Inter, sans-serif" fontSize="12.5" letterSpacing="0.6">
            {l.sub}
          </text>
        </g>
      ))}

      {/* Compass */}
      <g transform="translate(900 110)" stroke="#e9e1cf" strokeOpacity="0.7" fill="none">
        <circle r="34" strokeOpacity="0.3" />
        <path d="M0 -44 L7 0 L0 44 L-7 0 Z" fill="#e9e1cf" fillOpacity="0.15" />
        <path d="M0 -44 L7 0 L-7 0 Z" fill="#d8ff62" stroke="none" />
        <text y="-52" textAnchor="middle" fill="#e9e1cf" stroke="none" fontFamily="Inter, sans-serif" fontSize="12">N</text>
      </g>

      {/* Legend */}
      <g transform="translate(846 846)" fontFamily="Inter, sans-serif">
        <rect x="-10" y="-14" width="148" height="122" fill="#0a1820" fillOpacity="0.88" stroke="#e9e1cf" strokeOpacity="0.25" />
        <text fill="#e9e1cf" fontSize="11" letterSpacing="2" fontWeight="600">WORLD BIBLE</text>
        <text y="24" fill="#e9e1cf" fillOpacity="0.65" fontSize="11.5">4 locations</text>
        <text y="42" fill="#e9e1cf" fillOpacity="0.65" fontSize="11.5">3 acts · 1 route</text>
        <path d="M0 66 H100" stroke="#e9e1cf" strokeWidth="2" />
        <path d="M0 62 V70 M50 62 V70 M100 62 V70" stroke="#e9e1cf" />
        <text y="88" fill="#e9e1cf" fillOpacity="0.5" fontSize="10.5">0 · 50 · 100 leagues</text>
      </g>
    </svg>
  );
}
