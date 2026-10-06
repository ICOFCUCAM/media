import { CinemaArt } from "../../cf/CinemaArt";

/*
 * Marketplace — each listing pictured as the asset it sells, not as a film
 * still: a character turnaround sheet, a voice waveform, a template timeline,
 * a creature study. Story worlds keep an establishing frame.
 */

export function AssetVisual({ kind, name, className = "" }: { kind: string; name: string; className?: string }) {
  if (kind === "Character") return <Turnaround className={className} />;
  if (kind === "Voice Pack") return <VoiceSheet className={className} />;
  if (kind === "Template") return <TimelineSheet className={className} />;
  if (kind === "Asset Pack") return <CreatureSheet className={className} />;
  return <CinemaArt seed={`${name} ${kind}`} className={className} />;
}

/** A standing figure for the turnaround: front, three-quarter, side, back. */
function Pose({ x, turn }: { x: number; turn: number }) {
  const w = 30 - Math.abs(turn) * 10;
  return (
    <g transform={`translate(${x} 0)`}>
      <ellipse cx="0" cy="78" rx="11" ry="13" />
      <path d={`M${-w} 98 Q0 90 ${w} 98 L${w - 4} 190 L${-w + 4} 190 Z`} />
      <path d={`M${-w + 6} 190 L${-w + 8} 262 L-4 262 L0 200 L4 262 L${w - 8} 262 L${w - 6} 190 Z`} />
      <path d={`M-14 70 C-18 46 18 46 14 70 C10 58 -10 58 -14 70 Z`} fill="#b8432c" />
    </g>
  );
}

function Turnaround({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <rect width="400" height="250" fill="#efeadd" />
      <g stroke="#cbc4b2" strokeWidth="1">
        {[40, 80, 120, 160, 200].map((y) => (
          <path key={y} d={`M0 ${y} H400`} strokeDasharray="3 5" />
        ))}
      </g>
      <g fill="#1b1714" transform="translate(0 12) scale(0.62)">
        <Pose x={113} turn={0} />
        <Pose x={250} turn={0.5} />
        <Pose x={387} turn={1} />
        <Pose x={524} turn={0} />
      </g>
      <g fill="#6b6457" fontFamily="Inter, sans-serif" fontSize="10" letterSpacing="1.4" textAnchor="middle">
        {[["FRONT", 70], ["3/4", 155], ["SIDE", 240], ["BACK", 325]].map(([l, x]) => (
          <text key={l} x={x} y="196">{l}</text>
        ))}
      </g>
      <text x="14" y="22" fill="#1b1714" fontFamily="Inter, sans-serif" fontSize="11" fontWeight="600" letterSpacing="1.6">TURNAROUND · LOCKED IDENTITY</text>
    </svg>
  );
}

function VoiceSheet({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <defs>
        <linearGradient id="av-voice" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1d1530" />
          <stop offset="1" stopColor="#0c0a14" />
        </linearGradient>
      </defs>
      <rect width="400" height="250" fill="url(#av-voice)" />
      <g fill="#a98bff">
        {Array.from({ length: 64 }, (_, i) => {
          const h = 8 + Math.abs(Math.sin(i * 0.55) * 60 + Math.sin(i * 1.7) * 22);
          return <rect key={i} x={24 + i * 5.6} y={125 - h / 2} width="3" height={h} rx="1.5" opacity={0.45 + (i % 4) * 0.14} />;
        })}
      </g>
      <path d="M24 125 H382" stroke="#a98bff" strokeOpacity="0.25" />
      <circle cx="200" cy="125" r="3" fill="#d8ff62" />
      <path d="M200 40 V210" stroke="#d8ff62" strokeOpacity="0.7" />
      <text x="20" y="30" fill="#e9e3ff" fontFamily="Inter, sans-serif" fontSize="11" fontWeight="600" letterSpacing="1.6">“ONYX” · NARRATOR · 20 LANGUAGES</text>
    </svg>
  );
}

function TimelineSheet({ className }: { className: string }) {
  const tracks = [
    { y: 70, c: "#d8ff62", clips: [[20, 80], [106, 60], [172, 110], [288, 92]] },
    { y: 110, c: "#5fc8ff", clips: [[20, 150], [176, 120], [302, 78]] },
    { y: 150, c: "#a98bff", clips: [[60, 230], [296, 84]] },
    { y: 190, c: "#40d6b8", clips: [[20, 360]] },
  ];
  return (
    <svg viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <rect width="400" height="250" fill="#121312" />
      <g fill="#6c706a" fontFamily="Inter, sans-serif" fontSize="9" letterSpacing="1">
        {["0:00", "0:05", "0:10", "0:15", "0:20", "0:25", "0:30"].map((t, i) => (
          <text key={t} x={20 + i * 60} y="44">{t}</text>
        ))}
      </g>
      {tracks.map((t) => (
        <g key={t.y}>
          <rect x="20" y={t.y} width="360" height="26" rx="4" fill="#1c1e1c" />
          {t.clips.map(([x, w]) => (
            <rect key={x} x={x + 2} y={t.y + 3} width={w - 6} height="20" rx="3" fill={t.c} fillOpacity="0.28" stroke={t.c} strokeOpacity="0.7" />
          ))}
        </g>
      ))}
      <path d="M232 52 V226" stroke="#ffffff" strokeWidth="1.5" />
      <path d="M226 52 h12 l-6 8 z" fill="#ffffff" />
      <text x="20" y="24" fill="#e9e6dd" fontFamily="Inter, sans-serif" fontSize="11" fontWeight="600" letterSpacing="1.6">TEASER · 30S · BEAT MAP</text>
    </svg>
  );
}

function CreatureSheet({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <rect width="400" height="250" fill="#e9e3d4" />
      <g stroke="#cbc4b2">
        <path d="M0 146 H400" />
      </g>
      {/* A horned grassland beast, side study */}
      <g transform="translate(40 -18) scale(0.82)">
      <path
        fill="#1b1714"
        d="M86 200 L92 158 C80 150 74 132 84 118 C96 102 118 98 140 100 C170 82 230 80 268 96 C292 92 316 100 330 116 L352 104 L346 124 C356 132 358 146 350 156 L336 160 L332 200 L316 200 L314 168 C290 176 250 178 220 172 L214 200 L198 200 L196 172 C170 170 148 166 130 160 L124 200 Z"
      />
      <path d="M338 112 C350 84 362 70 380 64 C372 82 366 98 352 118 Z" fill="#1b1714" />
      <path d="M346 120 C356 108 368 104 380 106 C372 114 362 120 350 126 Z" fill="#1b1714" />
      <circle cx="336" cy="128" r="2.5" fill="#efe9db" />
      </g>
      <g fill="#6b6457" fontFamily="Inter, sans-serif" fontSize="10" letterSpacing="1.2">
        <text x="14" y="22" fill="#1b1714" fontWeight="600" letterSpacing="1.6">CREATURE STUDY · SIDE</text>

      </g>
      <path d="M36 146 V62 M30 62 H42 M30 146 H42" stroke="#6b6457" />
      <text x="48" y="108" fill="#6b6457" fontFamily="Inter, sans-serif" fontSize="10" letterSpacing="1.2">2.4 M</text>
    </svg>
  );
}
