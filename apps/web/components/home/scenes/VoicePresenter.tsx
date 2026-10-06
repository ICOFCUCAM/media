"use client";

import { useEffect, useState } from "react";

/*
 * Voice chapter — a voice-production monitor, not a feature illustration.
 * The shot is the original performance in the booth; around it, only what the
 * product really does: a 10–60 s sample becomes a cloned voice (Voice Lab),
 * the line is translated and re-voiced per language (dubbing, 20 languages),
 * and each language lands as its own track.
 */

const ORIGINAL = { code: "EN", lang: "English", text: "Our queen has returned." };
const DUBS = [
  { code: "YO", lang: "Yorùbá", text: "Ayaba wa ti padà dé." },
  { code: "SW", lang: "Kiswahili", text: "Malkia wetu amerudi." },
  { code: "FR", lang: "Français", text: "Notre reine est revenue." },
  { code: "ES", lang: "Español", text: "Nuestra reina ha vuelto." },
];
const LINE_SEC = 2.6;

/* A speech-like envelope per language: syllable bursts with breaths between.
 * Each dub has its own rhythm and length, as a re-voiced line would. */
function wave(seed: number, length: number): number[] {
  return Array.from({ length: 64 }, (_, k) => {
    if (k / 64 > length) return 0;
    const word = Math.sin(k * (0.45 + seed * 0.07) + seed) * 0.5 + 0.5;
    const syll = Math.abs(Math.sin(k * (1.7 + seed * 0.21) + seed * 2.3));
    const breath = (k + seed * 5) % 17 > 14;
    return breath ? 0.04 : Math.max(0.1, word * 0.55 + syll * 0.45);
  });
}
const LENGTH: Record<string, number> = { EN: 0.86, YO: 0.93, SW: 0.9, FR: 0.97, ES: 0.95 };

export function VoicePresenter({ still }: { still?: string }) {
  const [i, setI] = useState(1);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((v) => (v + 1) % DUBS.length), LINE_SEC * 1000);
    return () => clearInterval(t);
  }, []);

  const dub = DUBS[i]!;
  return (
    <figure className="vp-card" aria-label="Voice production monitor: the original English performance, dubbed line by line into other languages">
      <div className="vp-head">
        <span className="vp-rec">
          <i aria-hidden /> Original performance
        </span>
        <span className="vp-sample" title="Voice Lab clones a voice from 10–60 seconds of clear speech">
          Sample 0:30
          <b aria-hidden>
            <i style={{ width: "50%" }} />
          </b>
          <span className="vp-ready">Clone ready</span>
        </span>
      </div>

      <div className="vp-stage">
        {still ? (
          /* Plain <img>: the generated booth still from public/frames. */
          <img src={still} alt="" className="vp-art still-fill" loading="lazy" />
        ) : (
          <Booth />
        )}
        <span className="vp-safe" aria-hidden />
        <span className="vp-slate">Narrator · cloned voice</span>
        <div className="vp-caption" aria-live="polite">
          <div className="vp-orig">
            <span className="vp-lang">Original · {ORIGINAL.lang}</span>
            <span>{ORIGINAL.text}</span>
          </div>
          <div className="vp-dub">
            <span className="vp-lang is-dub">Dub · {dub.lang}</span>
            <span key={dub.code} className="vp-line">
              {dub.text}
            </span>
          </div>
        </div>
      </div>

      <div className="vp-tracks">
        {[ORIGINAL, ...DUBS].map((l, n) => {
          const on = l.code === dub.code;
          const orig = l.code === ORIGINAL.code;
          return (
            <div key={l.code} className={`vp-track${on ? " is-on" : ""}${orig ? " is-orig" : ""}`}>
              <span className="vp-code">{l.code}</span>
              <div className="vp-lane" aria-hidden>
                <svg viewBox="0 0 64 10" preserveAspectRatio="none">
                  {wave(n, LENGTH[l.code] ?? 0.9).map((a, k) => (
                    <rect key={k} x={k + 0.15} y={5 - a * 4.6} width="0.7" height={a * 9.2} />
                  ))}
                </svg>
                {on && <span key={`ph-${dub.code}`} className="vp-playhead" style={{ animationDuration: `${LINE_SEC}s` }} />}
              </div>
              <span className="vp-state">{orig ? "Original" : on ? "Playing" : "Dubbed"}</span>
            </div>
          );
        })}
        <div className="vp-more">
          <span>+15 more languages</span>
          <span>20 in all · subtitles with every dub</span>
        </div>
      </div>
    </figure>
  );
}

/* The booth: acoustic treatment, a warm key from the left, a cool rim from the
 * right, a large-diaphragm condenser in a shock mount and a pop filter, shot
 * shallow so the foreground falls soft. */
export function Booth({ className = "vp-art" }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <defs>
        <linearGradient id="vb-room" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#2a1d16" />
          <stop offset="0.45" stopColor="#14141a" />
          <stop offset="1" stopColor="#0b1018" />
        </linearGradient>
        <pattern id="vb-foam" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M0 0 L10 10 L0 20 Z" fill="#000" fillOpacity="0.35" />
          <path d="M20 0 L10 10 L20 20 Z" fill="#fff" fillOpacity="0.035" />
          <path d="M0 0 L20 0 L10 10 Z" fill="#fff" fillOpacity="0.02" />
        </pattern>
        <radialGradient id="vb-key" cx="0.12" cy="0.3" r="0.7">
          <stop offset="0" stopColor="#ffbf7f" stopOpacity="0.42" />
          <stop offset="0.5" stopColor="#c97a45" stopOpacity="0.1" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="vb-skin" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#b8794c" />
          <stop offset="0.45" stopColor="#7a4429" />
          <stop offset="1" stopColor="#2c1710" />
        </linearGradient>
        <linearGradient id="vb-knit" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#3b4a48" />
          <stop offset="0.6" stopColor="#1b2423" />
          <stop offset="1" stopColor="#0f1414" />
        </linearGradient>
        <linearGradient id="vb-mic" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#5d6067" />
          <stop offset="0.35" stopColor="#c9ccd2" />
          <stop offset="0.6" stopColor="#6b6e75" />
          <stop offset="1" stopColor="#25262a" />
        </linearGradient>
        <pattern id="vb-grille" width="3" height="3" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="0.75" fill="#0d0e10" fillOpacity="0.55" />
        </pattern>
        <radialGradient id="vb-vig" cx="0.45" cy="0.42" r="0.75">
          <stop offset="0.55" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.72" />
        </radialGradient>
        <filter id="vb-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.4" /></filter>
        <filter id="vb-bg" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="0.8" /></filter>
        <filter id="vb-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" /></filter>
        <filter id="vb-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" />
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.09 0" />
        </filter>
      </defs>

      {/* Room: treated walls, slightly soft behind the talent */}
      <g filter="url(#vb-bg)">
        <rect width="400" height="300" fill="url(#vb-room)" />
        <rect width="400" height="300" fill="url(#vb-foam)" />
        {[0, 100, 200, 300].map((x) => (
          <rect key={x} x={x + 0.5} y="-1" width="99" height="302" fill="none" stroke="#000" strokeOpacity="0.45" />
        ))}
        {/* Practical lamp, out of focus, upper right */}
        <circle cx="352" cy="58" r="16" fill="#9fb7e8" opacity="0.18" filter="url(#vb-glow)" />
      </g>
      <rect width="400" height="300" fill="url(#vb-key)" />

      {/* Talent */}
      <path d="M96 300 C104 240 146 212 200 208 C256 212 296 240 306 300 Z" fill="url(#vb-knit)" />
      <path d="M172 210 C184 226 216 226 228 210" fill="none" stroke="#4f625f" strokeWidth="3.5" />
      {/* Locs fall past the shoulders, catching the key light */}
      <g fill="#140c09" stroke="#4a2c1c" strokeWidth="0.9">
        {[147, 154, 161, 240, 247, 254].map((x, k) => (
          <rect key={x} x={x - 3.5} y={150} width="7" height={70 + (k % 3) * 18} rx="3.5" />
        ))}
      </g>
      <path d="M184 176 L184 212 C194 220 206 220 216 212 L216 176 Z" fill="#4f2b1b" />
      <path d="M216 186 C206 196 194 196 184 190 L184 176 L216 176 Z" fill="#000" opacity="0.3" />
      {/* Face: brow, cheekbones, a narrowing jaw */}
      <path d="M163 138 C162 108 180 98 200 98 C222 98 238 110 237 138 C237 152 233 166 226 177 C218 189 209 194 200 194 C190 194 181 188 174 177 C167 166 163 152 163 138 Z" fill="url(#vb-skin)" />
      <path d="M170 118 C176 106 188 101 200 101" fill="none" stroke="#f0b98b" strokeOpacity="0.35" strokeWidth="2" strokeLinecap="round" />
      <g fill="#120b08">
        <path d="M158 134 C152 90 176 64 202 64 C230 64 252 90 244 134 C238 114 226 100 200 100 C178 100 164 114 158 134 Z" />
      </g>
      {/* Eyes closed in the line, brows, nose, open mouth */}
      <g fill="none" stroke="#1c0f0a" strokeWidth="2" strokeLinecap="round">
        <path d="M180 142 q7 3.5 13 0" />
        <path d="M207 142 q7 3.5 13 0" />
        <path d="M178 132 q8 -4 15 -1 M206 131 q8 -3 15 1" />
      </g>
      <path d="M201 140 L199 158" stroke="#e0a271" strokeOpacity="0.35" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M198 147 q-5 11 1 14 q4 1 7 -1" fill="none" stroke="#3a1d12" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M193 172 q8 -4 16 0 q-8 7 -16 0 Z" fill="#2a1410" stroke="#5e2f22" strokeWidth="1" />
      <ellipse cx="179" cy="153" rx="8" ry="5" fill="#e0a271" opacity="0.12" />
      {/* Rim light down the shadow side */}
      <path d="M235 120 C240 138 237 160 226 178" fill="none" stroke="#a9c2f0" strokeOpacity="0.6" strokeWidth="1.6" />
      <path d="M262 236 C284 250 298 270 304 300" fill="none" stroke="#a9c2f0" strokeOpacity="0.35" strokeWidth="1.4" />
      {/* Closed-back headphones */}
      <path d="M154 140 C150 86 178 58 201 58 C226 58 254 86 248 140" fill="none" stroke="#24262b" strokeWidth="7" />
      <path d="M154 140 C150 86 178 58 201 58" fill="none" stroke="#6a6e77" strokeOpacity="0.5" strokeWidth="1.2" />
      <rect x="141" y="126" width="20" height="38" rx="8" fill="#1d1f23" />
      <rect x="241" y="126" width="20" height="38" rx="8" fill="#1d1f23" />
      <rect x="143" y="130" width="3" height="28" rx="1.5" fill="#c58a5a" opacity="0.5" />

      {/* Foreground: pop filter and condenser, shot soft */}
      <g filter="url(#vb-soft)">
        <path d="M400 236 L318 246 L284 252" fill="none" stroke="#2b2d32" strokeWidth="6" strokeLinecap="round" />
        <path d="M400 168 L300 186 L270 188" fill="none" stroke="#2b2d32" strokeWidth="3" strokeLinecap="round" />
        <circle cx="246" cy="182" r="25" fill="#0b0c10" fillOpacity="0.42" stroke="#3f434b" strokeWidth="3" />
        <g stroke="#6a6f79" strokeOpacity="0.3" strokeWidth="0.8">
          {[-18, -12, -6, 0, 6, 12, 18].map((d) => (
            <path key={d} d={`M${246 + d} 158 V206 M222 ${182 + d} H270`} />
          ))}
        </g>
        {/* Shock mount */}
        <ellipse cx="272" cy="250" rx="24" ry="9" fill="none" stroke="#3a3d44" strokeWidth="3" />
        <g stroke="#7d828c" strokeOpacity="0.5" strokeWidth="1">
          <path d="M250 246 L262 258 M294 246 L282 258 M258 242 L268 262 M286 242 L276 262" />
        </g>
        {/* Large-diaphragm capsule, angled at the mouth */}
        <g transform="rotate(-12 272 250)">
          <rect x="258" y="206" width="28" height="90" rx="13" fill="url(#vb-mic)" />
          <rect x="260" y="210" width="24" height="34" rx="11" fill="url(#vb-grille)" />
          <rect x="258" y="246" width="28" height="3" fill="#c8a35a" opacity="0.85" />
        </g>
      </g>

      <rect width="400" height="300" fill="url(#vb-vig)" />
      <rect width="400" height="300" filter="url(#vb-grain)" opacity="0.6" />
    </svg>
  );
}
