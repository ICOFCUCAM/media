"use client";

import { useEffect, useState } from "react";

/*
 * Voice chapter — a presenter in the booth: ring light, headphones, a pop
 * filter, a live waveform and the same line arriving in one language after
 * another. A human, performed experience rather than a landscape.
 */

const LINES = [
  { code: "EN", lang: "English", text: "Our queen has returned." },
  { code: "YO", lang: "Yorùbá", text: "Ayaba wa ti padà dé." },
  { code: "SW", lang: "Kiswahili", text: "Malkia wetu amerudi." },
  { code: "FR", lang: "Français", text: "Notre reine est revenue." },
  { code: "ES", lang: "Español", text: "Nuestra reina ha vuelto." },
];

export function VoicePresenter() {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((v) => (v + 1) % LINES.length), 2600);
    return () => clearInterval(t);
  }, []);

  const line = LINES[i]!;
  return (
    <figure className="vp-card" aria-label="A presenter recording narration, captioned in five languages">
      <div className="vp-stage">
        <Presenter />
        <span className="vp-rec">● REC · Narrator · cloned voice</span>
        <div className="vp-caption" aria-live="polite">
          <span className="vp-lang">{line.lang}</span>
          <span className="vp-line">{line.text}</span>
        </div>
      </div>
      <div className="vp-bar">
        <div className="vp-wave" aria-hidden>
          {Array.from({ length: 36 }).map((_, k) => (
            <span key={k} style={{ animationDelay: `${(k % 9) * 0.08}s`, height: `${8 + ((k * 37) % 20)}px` }} />
          ))}
        </div>
        <div className="vp-codes">
          {LINES.map((l, k) => (
            <span key={l.code} className={k === i ? "is-on" : ""}>
              {l.code}
            </span>
          ))}
        </div>
      </div>
    </figure>
  );
}

export function Presenter({ className = "vp-art" }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <defs>
        <radialGradient id="vp-bg" cx="0.5" cy="0.35" r="0.8">
          <stop offset="0" stopColor="#2a2240" />
          <stop offset="0.6" stopColor="#121420" />
          <stop offset="1" stopColor="#08090d" />
        </radialGradient>
        <radialGradient id="vp-skin" cx="0.62" cy="0.38" r="0.7">
          <stop offset="0" stopColor="#9a5d3c" />
          <stop offset="0.6" stopColor="#5e3423" />
          <stop offset="1" stopColor="#2c1710" />
        </radialGradient>
        <pattern id="vp-foam" width="22" height="22" patternUnits="userSpaceOnUse">
          <path d="M0 22 L11 0 L22 22 Z" fill="#ffffff" fillOpacity="0.025" />
        </pattern>
        <filter id="vp-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6" /></filter>
      </defs>
      <rect width="400" height="300" fill="url(#vp-bg)" />
      <rect width="400" height="300" fill="url(#vp-foam)" />
      {/* Ring light */}
      <circle cx="200" cy="112" r="92" fill="none" stroke="#f6eedd" strokeOpacity="0.55" strokeWidth="7" filter="url(#vp-glow)" />
      <circle cx="200" cy="112" r="92" fill="none" stroke="#fffaf0" strokeOpacity="0.7" strokeWidth="2" />
      {/* Shoulders and sweater */}
      <path d="M90 300 C100 236 140 206 200 202 C260 206 300 236 310 300 Z" fill="#1f2a2c" />
      <path d="M170 204 C182 222 218 222 230 204" fill="none" stroke="#3b4f52" strokeWidth="4" />
      {/* Neck and face */}
      <path d="M182 176 L182 208 C192 216 208 216 218 208 L218 176 Z" fill="#4a2a1c" />
      <ellipse cx="200" cy="142" rx="38" ry="46" fill="url(#vp-skin)" />
      {/* Locs */}
      <g fill="#140d0a">
        <path d="M156 132 C150 86 176 62 202 62 C232 62 254 86 246 132 C240 112 226 98 200 98 C176 98 162 112 156 132 Z" />
        {[150, 158, 166, 236, 244, 252].map((x, k) => (
          <rect key={x} x={x - 4} y={112} width="8" height={70 + (k % 3) * 18} rx="4" />
        ))}
      </g>
      {/* Eyes closed in performance, mouth mid-line */}
      <g fill="none" stroke="#1c0f0a" strokeWidth="2.2" strokeLinecap="round">
        <path d="M181 138 q7 4 14 0" />
        <path d="M207 138 q7 4 14 0" />
      </g>
      <ellipse cx="202" cy="166" rx="7" ry="4.5" fill="#2a1410" />
      <path d="M201 142 q-5 11 1 14 q4 1 6 -1" fill="none" stroke="#3a1d12" strokeWidth="1.8" strokeLinecap="round" />
      <ellipse cx="222" cy="150" rx="9" ry="6" fill="#c98a5e" opacity="0.25" />
      <path d="M180 128 q8 -4 15 -1 M206 127 q8 -3 15 1" fill="none" stroke="#1c0f0a" strokeWidth="2" strokeLinecap="round" />
      {/* Headphones */}
      <path d="M152 136 C150 84 178 56 200 56 C224 56 252 84 250 136" fill="none" stroke="#2e3036" strokeWidth="7" />
      <rect x="140" y="124" width="20" height="36" rx="8" fill="#2e3036" />
      <rect x="242" y="124" width="20" height="36" rx="8" fill="#2e3036" />
      <rect x="258" y="134" width="3" height="16" rx="1.5" fill="#d8ff62" />
      {/* Pop filter on its arm */}
      <path d="M340 300 L320 214 L268 196" fill="none" stroke="#3a3d44" strokeWidth="5" />
      <circle cx="258" cy="186" r="26" fill="#0b0c10" fillOpacity="0.55" stroke="#5a5e68" strokeWidth="3" />
      <g stroke="#5a5e68" strokeOpacity="0.5" strokeWidth="1">
        {[-16, -8, 0, 8, 16].map((d) => (
          <path key={d} d={`M${258 + d} 162 V210 M234 ${186 + d} H282`} />
        ))}
      </g>
    </svg>
  );
}
