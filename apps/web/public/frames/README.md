# Homepage frames

Real cinematic stills for the homepage, one per slot: `hero`, `world`, `story`,
`voice`, `work-1` … `work-6` (`.webp`). Generate them with CineForge's image engine:

    OPENAI_API_KEY=sk-... node apps/web/scripts/generate-frames.mjs

Any missing slot falls back to its drawn illustration (`lib/frames.ts`).
