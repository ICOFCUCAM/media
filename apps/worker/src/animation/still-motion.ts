/**
 * The still-motion engine (W12; Part 5 §181.4–6). A storybook or motion-comic
 * shot is one drawn image — an illustrated page or a comic panel, the shot's
 * seed still — brought to life by the camera: a slow push, a pan across the
 * panel, a tilt down the page. FFmpeg moves the camera; no video model runs,
 * so it costs one image per shot and no GPU time ("relatively inexpensive
 * computationally", §181.6).
 *
 * It is a VideoModelAdapter like any other: it reports what it actually
 * produced (an execution report and a timing report measured from the file),
 * and the shot goes through the same quality gates before it is READY.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CameraMovement, ModelCapabilities, ShotRequest, ShotResult, VideoModelAdapter } from "@cineforge/model-adapters";
import { framesDurationUs, secondsToUs } from "@cineforge/shared";
import { ffmpeg as runFfmpeg, type FfmpegRunner } from "../ffmpeg/ffmpeg";
import { probeStreams } from "../ffmpeg/analysis";
import type { Storage } from "../storage/storage";

export const STILL_MOTION_ID = "still-motion";
export const STILL_MOTION_FPS = 24;

/**
 * The camera path for a movement, as zoompan expressions over output frame
 * `on` of N (the source is pre-scaled 2× so slow moves stay smooth). Every
 * path keeps the crop inside the image: x ∈ [0, iw − iw/zoom], y likewise.
 */
export function cameraPath(movement: CameraMovement | undefined, frames: number): { z: string; x: string; y: string } {
  const t = `(on/${Math.max(1, frames - 1)})`;
  const cx = "(iw-iw/zoom)/2";
  const cy = "(ih-ih/zoom)/2";
  switch (movement) {
    case "pan": return { z: "1.15", x: `(iw-iw/zoom)*${t}`, y: cy };
    case "tilt": return { z: "1.15", x: cx, y: `(ih-ih/zoom)*${t}` };
    case "dolly": return { z: `1+0.2*${t}`, x: cx, y: cy };
    case "crane": return { z: "1.12", x: cx, y: `(ih-ih/zoom)*(1-${t})` };
    case "drone": return { z: `1.25-0.2*${t}`, x: cx, y: cy };
    case "handheld": return { z: `1.12+0.04*${t}`, x: `${cx}*(1+0.6*sin(on/6))`, y: `${cy}*(1+0.6*cos(on/7))` };
    case "static":
    default: return { z: `1+0.15*${t}`, x: cx, y: cy };
  }
}

/** FFmpeg arguments: one still → `frames` frames of camera movement at `fps`, H.264. */
export function stillMotionArgs(
  input: string,
  output: string,
  o: { width: number; height: number; durationSec: number; movement?: CameraMovement; fps?: number },
): string[] {
  const fps = o.fps ?? STILL_MOTION_FPS;
  const frames = Math.round(o.durationSec * fps);
  const p = cameraPath(o.movement, frames);
  const vf = [
    `scale=${o.width * 2}:${o.height * 2}:force_original_aspect_ratio=increase`,
    `crop=${o.width * 2}:${o.height * 2}`,
    `zoompan=z='${p.z}':x='${p.x}':y='${p.y}':d=${frames}:s=${o.width}x${o.height}:fps=${fps}`,
    "format=yuv420p",
  ].join(",");
  return ["-i", input, "-vf", vf, "-frames:v", String(frames), "-r", String(fps),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-movflags", "+faststart", "-an", output];
}

export interface StillMotionDeps {
  storage: Pick<Storage, "download" | "upload">;
  ffmpeg?: FfmpegRunner;
  probe?: typeof probeStreams;
  /** Where the clip is stored. */
  clipKey(req: ShotRequest): string;
}

export class StillMotionEngine implements VideoModelAdapter {
  readonly id = STILL_MOTION_ID;
  constructor(private readonly deps: StillMotionDeps) {}

  capabilities(): ModelCapabilities {
    return {
      id: this.id,
      displayName: "Still motion (storybook, motion comic)",
      version: "1",
      class: "primary",
      maxDurationSec: 60,
      resolutions: [],
      supportsReferenceImage: true,
      supportsReferenceVideo: false,
      supportsLora: false,
      supportsSeed: false,
      tiers: ["FREE", "CREATOR", "STUDIO", "ENTERPRISE"],
    };
  }

  estimateCost(): number {
    return 0;
  }

  async healthcheck() {
    return { healthy: true, modelLoaded: true, detail: "ffmpeg" };
  }

  async generate(req: ShotRequest): Promise<ShotResult> {
    const still = req.referenceImageKeys?.[0];
    if (!still) throw new Error("still-motion needs the shot's drawn page or panel (its seed still); none was given");
    const fps = req.fps ?? STILL_MOTION_FPS;
    const dir = await mkdtemp(join(tmpdir(), "still-motion-"));
    try {
      const src = join(dir, "still.png");
      const out = join(dir, "clip.mp4");
      await this.deps.storage.download(still, src);
      const started = Date.now();
      await (this.deps.ffmpeg ?? runFfmpeg)(stillMotionArgs(src, out, {
        width: req.width, height: req.height, durationSec: req.durationSec, movement: req.camera?.movement, fps,
      }));
      // What was produced is measured from the file, never echoed from the request.
      const facts = await (this.deps.probe ?? probeStreams)(out);
      if (!facts.hasVideo || !facts.frameCount || !facts.frameRate) throw new Error("still-motion produced no video stream");
      const key = this.deps.clipKey(req);
      await this.deps.storage.upload(out, key, "video/mp4");
      const requestedUs = secondsToUs(req.durationSec);
      const actualUs = framesDurationUs(facts.frameCount, facts.frameRate);
      return {
        videoKey: key,
        thumbnailKey: still,
        seed: 0,
        gpuMs: 0,
        width: req.width,
        height: req.height,
        durationSec: req.durationSec,
        timing: {
          kind: "video",
          requestedDurationUs: requestedUs.toString(),
          actualDurationUs: actualUs.toString(),
          containerDurationUs: facts.durationUs?.toString() ?? null,
          timingAccuracy: { deltaUs: (actualUs - requestedUs).toString(), ratio: Number(actualUs) / Number(requestedUs) },
          frameRate: { num: facts.frameRate.num, den: facts.frameRate.den },
          frameCount: facts.frameCount,
          requestedFrameRate: { num: fps, den: 1 },
          conformApplied: "none",
          measuredBy: `ffprobe (still-motion, ${Date.now() - started} ms)`,
        },
        execution: {
          mode: "real", conditioning: "i2v", width: req.width, height: req.height, frames: facts.frameCount, fps,
          referenceImagesUsed: 1, referenceImagesIgnored: Math.max(0, (req.referenceImageKeys?.length ?? 1) - 1),
          referenceVideoIgnored: Boolean(req.referenceVideoKeys?.length), cameraIgnored: false,
        },
        realExecution: true,
      };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
