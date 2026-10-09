/**
 * Measure media for the quality gates with ffmpeg/ffprobe (real tools, real
 * files — never trust a provider's claim, DOS-70). One download per clip
 * serves both technical QC and the Visual Reviewer's frame.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RequestImage } from "@cineforge/movie";
import { measureBlack, measureFreezes, measureLoudness, probeSize, probeStreams, sha256File } from "../ffmpeg/analysis";
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
  const [size, black, frozen, sha256, loud] = await Promise.all([
    streams.hasVideo ? probeSize(path).catch(() => null) : Promise.resolve(null),
    streams.hasVideo ? measureBlack(path).catch(() => []) : Promise.resolve([]),
    streams.hasVideo ? measureFreezes(path, total).catch(() => []) : Promise.resolve([]),
    sha256File(path),
    opts.loudness && streams.hasAudio ? measureLoudness(path).catch(() => null) : Promise.resolve(null),
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
  };
}

/** One JPEG frame from the middle of a local clip, 768 px wide. */
export async function grabFrame(path: string, durationSec: number | null, dir: string): Promise<RequestImage> {
  const out = join(dir, "frame.jpg");
  const mid = Math.max(0, (durationSec ?? 0) / 2);
  await ffmpeg(["-y", "-ss", mid.toFixed(3), "-i", path, "-frames:v", "1", "-vf", "scale=768:-2", "-q:v", "4", out]);
  return { mediaType: "image/jpeg", data: (await readFile(out)).toString("base64") };
}

export interface ClipInspection {
  facts: MediaFacts;
  /** Mid-clip frame for the Visual Reviewer, when asked for and the clip has picture. */
  frame: RequestImage | null;
  frameError?: string;
}

/** Download a stored clip once, measure it, optionally grab a frame, clean up. */
export async function inspectClip(
  download: (key: string, dest: string) => Promise<void>,
  key: string,
  opts: { frame: boolean },
): Promise<ClipInspection> {
  const dir = await mkdtemp(join(tmpdir(), "cf-qc-"));
  try {
    const clip = join(dir, "clip.mp4");
    await download(key, clip);
    const facts = await measureMedia(clip);
    let frame: RequestImage | null = null;
    let frameError: string | undefined;
    if (opts.frame && facts.hasVideo) {
      try {
        frame = await grabFrame(clip, facts.durationSec, dir);
      } catch (e) {
        frameError = e instanceof Error ? e.message.slice(0, 200) : String(e);
      }
    }
    return { facts, frame, frameError };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
