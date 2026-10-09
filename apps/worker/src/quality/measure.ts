/**
 * Measure media for the quality gates with ffmpeg/ffprobe (real tools, real
 * files — never trust a provider's claim, DOS-70). One download per clip
 * serves both technical QC and the Visual Reviewer's frame.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RequestImage } from "@cineforge/movie";
import { measureBlack, measureFreezes, measureLoudness, probeFormat, probeSize, probeStreams, sha256File } from "../ffmpeg/analysis";
import { ffmpeg } from "../ffmpeg/ffmpeg";
import type { MediaFacts } from "./gates";

const sec = (us: bigint | null | undefined) => (us === null || us === undefined ? null : Number(us) / 1e6);

/** Facts of a local media file. An unreadable file is a fact too, not an exception. */
export async function measureMedia(path: string, opts: { loudness?: boolean } = {}): Promise<MediaFacts> {
  let streams;
  try {
    streams = await probeStreams(path);
  } catch {
    return { readable: false, hasVideo: false, hasAudio: false, durationSec: null, width: null, height: null, black: [], frozen: [] };
  }
  const durationSec = sec(streams.durationUs);
  const total = streams.durationUs ?? undefined;
  const [size, black, frozen, sha256, loud, format] = await Promise.all([
    streams.hasVideo ? probeSize(path).catch(() => null) : Promise.resolve(null),
    streams.hasVideo ? measureBlack(path).catch(() => []) : Promise.resolve([]),
    streams.hasVideo ? measureFreezes(path, total).catch(() => []) : Promise.resolve([]),
    sha256File(path),
    opts.loudness && streams.hasAudio ? measureLoudness(path).catch(() => null) : Promise.resolve(null),
    probeFormat(path).catch(() => null),
  ]);
  return {
    readable: true,
    hasVideo: streams.hasVideo,
    hasAudio: streams.hasAudio,
    durationSec,
    width: size?.width ?? null,
    height: size?.height ?? null,
    black: black.map((i) => [sec(i.startUs)!, sec(i.endUs)!] as [number, number]),
    frozen: frozen.map((i) => [sec(i.startUs)!, sec(i.endUs)!] as [number, number]),
    loudness: loud ? { integratedLufs: loud.integratedLufs, truePeakDbtp: loud.truePeakDbtp } : null,
    sha256,
    format,
  };
}

/** One JPEG frame from the middle of a local clip, 768 px wide. */
export async function grabFrame(path: string, durationSec: number | null, dir: string, at = 0.5, name = "frame.jpg"): Promise<RequestImage> {
  const out = join(dir, name);
  const t = Math.max(0, (durationSec ?? 0) * at);
  await ffmpeg(["-y", "-ss", t.toFixed(3), "-i", path, "-frames:v", "1", "-vf", "scale=768:-2", "-q:v", "4", out]);
  return { mediaType: "image/jpeg", data: (await readFile(out)).toString("base64") };
}

/** Where in a clip the Visual Reviewer looks (W18): near the start, the middle, near the end. */
export const REVIEW_POINTS = [0.08, 0.5, 0.92] as const;

/**
 * Start, middle and end frames, in order (W18). A clip too short to tell them
 * apart (< 1 s) gives the middle frame only; a frame that cannot be taken is
 * skipped as long as the middle one exists.
 */
export async function grabFrames(path: string, durationSec: number | null, dir: string): Promise<RequestImage[]> {
  if (!durationSec || durationSec < 1) return [await grabFrame(path, durationSec, dir)];
  const out: RequestImage[] = [];
  for (const [i, at] of REVIEW_POINTS.entries()) {
    const f = await grabFrame(path, durationSec, dir, at, `frame-${i}.jpg`).catch((e: unknown) => {
      if (at === 0.5) throw e;
      return null;
    });
    if (f) out.push(f);
  }
  return out;
}

/** The clip's last frame as JPEG bytes (end-state memory for the next shot). */
export async function grabLastFrame(path: string, dir: string): Promise<Uint8Array> {
  const out = join(dir, "end.jpg");
  await ffmpeg(["-y", "-sseof", "-0.25", "-i", path, "-frames:v", "1", "-q:v", "3", out]);
  return new Uint8Array(await readFile(out));
}

export interface ClipInspection {
  facts: MediaFacts;
  /** Last frame, when asked for and the clip has picture. */
  endFrame?: Uint8Array | null;
  /** Start / middle / end frames for the Visual Reviewer (W18), when asked for and the clip has picture; empty otherwise. */
  frames: RequestImage[];
  frameError?: string;
}

/** Download a stored clip once, measure it, optionally grab the review frames, clean up. */
export async function inspectClip(
  download: (key: string, dest: string) => Promise<void>,
  key: string,
  opts: { frame: boolean; endFrame?: boolean },
): Promise<ClipInspection> {
  const dir = await mkdtemp(join(tmpdir(), "cf-qc-"));
  try {
    const clip = join(dir, "clip.mp4");
    await download(key, clip);
    const facts = await measureMedia(clip);
    let frames: RequestImage[] = [];
    let frameError: string | undefined;
    if (opts.frame && facts.hasVideo) {
      try {
        frames = await grabFrames(clip, facts.durationSec, dir);
      } catch (e) {
        frameError = e instanceof Error ? e.message.slice(0, 200) : String(e);
      }
    }
    let endFrame: Uint8Array | null = null;
    if (opts.endFrame && facts.hasVideo) endFrame = await grabLastFrame(clip, dir).catch(() => null);
    return { facts, frames, frameError, endFrame };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
