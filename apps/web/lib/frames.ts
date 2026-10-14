import fs from "node:fs";
import path from "node:path";

/*
 * Homepage frames (docs/37). Real cinematic stills live in public/frames —
 * generated with CineForge's own image engine by scripts/generate-frames.mjs.
 * Each slot falls back to its drawn illustration until its file exists, so
 * the page never ships an empty frame. Server-only (reads the filesystem at
 * build/render time).
 */

export type FrameSlot = "hero" | "hero-wide" | "hero-1" | "hero-2" | "hero-3" | "world" | "story" | "voice" | "work-1" | "work-2" | "work-3" | "work-4" | "work-5" | "work-6";

export function frame(slot: FrameSlot): string | undefined {
  const file = path.join(process.cwd(), "public", "frames", `${slot}.webp`);
  return fs.existsSync(file) ? `/frames/${slot}.webp` : undefined;
}

/**
 * A homepage film loop (public/frames/<slot>.mp4), when one has been made —
 * e.g. hero-loop.mp4: six seconds of the master shot generated from the hero
 * still on the Wan 2.2 pod. Undefined until the file exists.
 */
export function frameVideo(slot: "hero-loop"): string | undefined {
  const file = path.join(process.cwd(), "public", "frames", `${slot}.mp4`);
  return fs.existsSync(file) ? `/frames/${slot}.mp4` : undefined;
}
