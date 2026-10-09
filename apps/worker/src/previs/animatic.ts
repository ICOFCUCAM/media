/**
 * The previs animatic (DirectorOS W19; Part 1 §41–43). Before any GPU second
 * is spent on video, each scene of a three-pass production is shown as it
 * will play: its storyboard stills, moved by each shot's planned camera (the
 * still-motion engine), for each shot's planned length, under the scene's
 * rough voice track. The owner approves the scene from this, not from a grid
 * of stills.
 *
 * The voice is the scene's real voice track (the audio job is idempotent and
 * the speech cache keeps every line), so the final pass reuses it; nothing is
 * spoken twice. Rough timing: when the voice runs longer than the planned
 * pictures, the scene is flagged PREVIS_TIMING before video is generated.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CameraMovement } from "@cineforge/model-adapters";
import { stillMotionArgs } from "../animation/still-motion";

export const ANIMATIC_FPS = 24;
/** A voice that runs longer than the pictures by more than this is a timing problem (seconds). */
export const TIMING_TOLERANCE_SEC = 0.5;

const MOVEMENTS = new Set<CameraMovement>(["static", "pan", "tilt", "dolly", "crane", "handheld", "drone"]);

/** A shot's planned camera movement as the still-motion engine moves it; anything else holds with a slow push. */
export function movementOf(v: string | null | undefined): CameraMovement {
  const m = (v ?? "").toLowerCase().trim();
  if (MOVEMENTS.has(m as CameraMovement)) return m as CameraMovement;
  if (/push|track|zoom/.test(m)) return "dolly";
  if (/hand/.test(m)) return "handheld";
  if (/aerial|drone/.test(m)) return "drone";
  if (/crane|jib|boom/.test(m)) return "crane";
  if (/tilt/.test(m)) return "tilt";
  if (/pan/.test(m)) return "pan";
  return "static";
}

export interface AnimaticShot {
  id: string;
  durationSec: number;
  /** The storyboard still, or null for a text-led shot (shown as a dark card). */
  stillKey: string | null;
  cameraMovement: string | null;
}

export interface AnimaticPlan {
  segments: { shotId: string; stillKey: string | null; durationSec: number; movement: CameraMovement }[];
  pictureSec: number;
  voiceSec: number | null;
  /** How much longer the voice runs than the pictures (0 when it fits). */
  overrunSec: number;
  missingStills: number;
}

/** What the animatic will show, and its rough timing (pure). */
export function planAnimatic(shots: AnimaticShot[], voiceSec: number | null): AnimaticPlan {
  const segments = shots.filter((s) => s.durationSec > 0).map((s) => ({
    shotId: s.id, stillKey: s.stillKey, durationSec: s.durationSec, movement: movementOf(s.cameraMovement),
  }));
  const pictureSec = +segments.reduce((a, s) => a + s.durationSec, 0).toFixed(3);
  const over = voiceSec !== null ? voiceSec - pictureSec : 0;
  return {
    segments,
    pictureSec,
    voiceSec,
    overrunSec: over > TIMING_TOLERANCE_SEC ? +over.toFixed(3) : 0,
    missingStills: segments.filter((s) => !s.stillKey).length,
  };
}

/** The animatic's frame size: 640 wide (or 640 tall for portrait), even dimensions, the project's aspect. */
export function animaticSize(aspectRatio: string | null | undefined): { width: number; height: number } {
  const [a, b] = (aspectRatio ?? "16:9").split(":").map(Number);
  const r = a && b ? a / b : 16 / 9;
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  return r >= 1 ? { width: 640, height: even(640 / r) } : { width: even(640 * r), height: 640 };
}

/** A dark card for a shot with no still. */
export function cardArgs(output: string, o: { width: number; height: number; durationSec: number; fps?: number }): string[] {
  const fps = o.fps ?? ANIMATIC_FPS;
  return ["-f", "lavfi", "-i", `color=c=0x1a1a1a:s=${o.width}x${o.height}:r=${fps}:d=${o.durationSec.toFixed(3)}`,
    "-frames:v", String(Math.round(o.durationSec * fps)), "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-an", output];
}

/** Join the segments and lay the voice under them, cut to the pictures' length. */
export function muxArgs(listFile: string, voice: string | null, output: string, pictureSec: number): string[] {
  const base = ["-f", "concat", "-safe", "0", "-i", listFile];
  if (!voice) return [...base, "-c:v", "copy", "-an", "-movflags", "+faststart", output];
  return [...base, "-i", voice, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
    "-af", "apad", "-t", pictureSec.toFixed(3), "-movflags", "+faststart", output];
}

export interface AnimaticDeps {
  download(key: string, dest: string): Promise<void>;
  upload(path: string, key: string, contentType: string): Promise<void>;
  ffmpeg(args: string[]): Promise<void>;
}

/** Render the animatic to `key` (ffmpeg; no GPU). */
export async function renderAnimatic(deps: AnimaticDeps, plan: AnimaticPlan, o: { voiceKey: string | null; key: string; aspectRatio?: string | null }): Promise<void> {
  if (!plan.segments.length) throw new Error("the scene has no shots to show");
  const size = animaticSize(o.aspectRatio);
  const dir = await mkdtemp(join(tmpdir(), "cf-animatic-"));
  try {
    const parts: string[] = [];
    for (const [i, s] of plan.segments.entries()) {
      const out = join(dir, `seg-${i}.mp4`);
      if (s.stillKey) {
        const still = join(dir, `still-${i}`);
        await deps.download(s.stillKey, still);
        await deps.ffmpeg(["-y", ...stillMotionArgs(still, out, { ...size, durationSec: s.durationSec, movement: s.movement, fps: ANIMATIC_FPS })]);
      } else {
        await deps.ffmpeg(["-y", ...cardArgs(out, { ...size, durationSec: s.durationSec })]);
      }
      parts.push(out);
    }
    const list = join(dir, "list.txt");
    await writeFile(list, parts.map((p) => `file '${p}'`).join("\n"));
    let voice: string | null = null;
    if (o.voiceKey) {
      voice = join(dir, "voice.wav");
      await deps.download(o.voiceKey, voice);
    }
    const out = join(dir, "animatic.mp4");
    await deps.ffmpeg(["-y", ...muxArgs(list, voice, out, plan.pictureSec)]);
    await deps.upload(out, o.key, "video/mp4");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
