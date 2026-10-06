/*
 * Story chapter — a character close-up: Amara in profile, rim-lit by warm
 * firelight against a teal night, shallow depth of field, with a burned-in
 * subtitle. Characters are the subject here, not places — a different shot
 * size and palette from the hero's master and the world atlas.
 */

const BOKEH = [
  { x: 610, y: 210, r: 70, c: "#e8955a", o: 0.32 },
  { x: 700, y: 380, r: 46, c: "#f3c27a", o: 0.28 },
  { x: 560, y: 120, r: 34, c: "#f3c27a", o: 0.22 },
  { x: 120, y: 160, r: 90, c: "#2f6a70", o: 0.35 },
  { x: 90, y: 520, r: 60, c: "#3f7f86", o: 0.25 },
  { x: 720, y: 640, r: 88, c: "#c46a3a", o: 0.2 },
  { x: 200, y: 330, r: 30, c: "#5aa0a6", o: 0.25 },
  { x: 650, y: 820, r: 50, c: "#e8955a", o: 0.18 },
];

/* Profile facing right: back of the head under the headwrap, forehead, nose, lips, chin, neck. */
const FACE =
  "M300 1000 L318 820 C300 760 286 700 296 640 C306 590 340 560 382 540 L452 470 C470 472 486 486 494 506 C500 520 504 532 512 548 C524 566 540 580 538 594 C536 604 522 606 514 610 C520 620 522 628 516 636 C522 644 520 654 510 660 C506 676 500 690 486 700 C470 710 452 712 440 716 C438 744 446 776 462 812 C478 852 500 920 512 1000 Z";
const PROFILE_EDGE =
  "M452 470 C470 472 486 486 494 506 C500 520 504 532 512 548 C524 566 540 580 538 594 C536 604 522 606 514 610 C520 620 522 628 516 636 C522 644 520 654 510 660 C506 676 500 690 486 700 C470 710 452 712 440 716 C438 744 446 776 462 812 C478 852 500 920 512 1000";
/* Gele — the sculpted headwrap, rising back and up. */
const GELE =
  "M282 600 C250 520 262 420 330 352 C392 290 492 262 560 300 C600 322 604 372 572 404 C540 436 500 448 470 470 L452 470 C420 500 392 530 382 540 C346 556 312 580 296 640 Z";

export function StoryCloseUp({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 800 1000" preserveAspectRatio="xMidYMid slice" className={className} role="img" aria-label="Close-up: Amara in profile, firelit, with the subtitle 'Then we will build it ourselves.'">
      <defs>
        <radialGradient id="sc-bg" cx="0.75" cy="0.35" r="0.9">
          <stop offset="0" stopColor="#3a2a22" />
          <stop offset="0.45" stopColor="#14232a" />
          <stop offset="1" stopColor="#070c10" />
        </radialGradient>
        <linearGradient id="sc-skin" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0" stopColor="#5a3020" />
          <stop offset="0.25" stopColor="#2a160f" />
          <stop offset="1" stopColor="#0d0807" />
        </linearGradient>
        <linearGradient id="sc-gele" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c0682c" />
          <stop offset="0.35" stopColor="#7a2d18" />
          <stop offset="1" stopColor="#1e0b07" />
        </linearGradient>
        <filter id="sc-bokeh" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14" /></filter>
        <filter id="sc-rim" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3.5" result="g" />
          <feMerge><feMergeNode in="g" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <linearGradient id="sc-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.7" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.75" />
        </linearGradient>
      </defs>

      <rect width="800" height="1000" fill="url(#sc-bg)" />
      <g filter="url(#sc-bokeh)">
        {BOKEH.map((b, i) => (
          <circle key={i} cx={b.x} cy={b.y} r={b.r} fill={b.c} opacity={b.o} />
        ))}
      </g>
      {/* Firelight spill from the right */}
      <ellipse cx="760" cy="560" rx="260" ry="420" fill="#e07a3a" opacity="0.16" filter="url(#sc-bokeh)" />

      {/* Face and headwrap, framed tight for a close-up */}
      <g transform="translate(-150 -150) scale(1.32)">
      <path d={FACE} fill="url(#sc-skin)" />
      <path d={GELE} fill="url(#sc-gele)" />
      <g fill="none" stroke="#e9a35c" strokeOpacity="0.35" strokeWidth="2">
        <path d="M300 560 C320 470 380 390 470 340" />
        <path d="M330 470 C380 400 450 350 540 330" />
        <path d="M296 610 C300 540 330 470 390 420" />
      </g>
      {/* Rim light along the profile and the wrap */}
      <path d={PROFILE_EDGE} fill="none" stroke="#ffc786" strokeWidth="2.6" strokeLinecap="round" filter="url(#sc-rim)" />
      <path d="M470 470 C500 448 540 436 572 404 C604 372 600 322 560 300" fill="none" stroke="#ffc786" strokeOpacity="0.8" strokeWidth="2" filter="url(#sc-rim)" />
      {/* Eye catchlight, brow and earring */}
      <path d="M470 538 q12 -6 22 2" fill="none" stroke="#ffe2b8" strokeWidth="2.2" strokeLinecap="round" opacity="0.85" />
      <path d="M462 516 q16 -8 30 -2" fill="none" stroke="#ffb878" strokeOpacity="0.4" strokeWidth="2" />
      <circle cx="404" cy="652" r="9" fill="none" stroke="#e8b45a" strokeWidth="3" />
      <circle cx="409" cy="648" r="2.2" fill="#fff1d0" />
        {/* Wrapper cloth at the shoulder, catching the same firelight */}
        <path d="M250 1000 C280 880 340 820 420 800 C470 790 520 820 560 860 C600 900 620 960 630 1000 Z" fill="#2a120c" />
        <path d="M420 800 C470 790 520 820 560 860 C600 900 620 960 630 1000" fill="none" stroke="#e9a35c" strokeOpacity="0.55" strokeWidth="2" />
        <path d="M330 900 C380 860 440 850 500 870" fill="none" stroke="#7a2d18" strokeWidth="3" />
      </g>

      <rect width="800" height="1000" fill="url(#sc-fade)" />

      {/* Slate and subtitle, as they would be burned into a dailies frame */}
      <g fontFamily="Inter, sans-serif">
        <text x="60" y="118" fill="#f2ede1" fillOpacity="0.8" fontSize="15" letterSpacing="2.4">CU · AMARA</text>
        <text x="60" y="140" fill="#f2ede1" fillOpacity="0.5" fontSize="13" letterSpacing="1.6">SC 12 · TK 3 · 85MM</text>
        <text x="400" y="880" textAnchor="middle" fill="#ffffff" fontSize="30" fontWeight="500" style={{ paintOrder: "stroke" }} stroke="#000" strokeOpacity="0.55" strokeWidth="4">
          — Then we will build it ourselves.
        </text>
      </g>
    </svg>
  );
}
