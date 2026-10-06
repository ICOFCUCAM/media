/**
 * FFmpeg measurements for the A/V Sync Engine (docs/38 §AU.7, §AU.10). FFmpeg
 * is the media-processing executor (§AW.7): these builders only MEASURE —
 * loudness (EBU R128 with true peak), silence, black frames, frozen frames and
 * stream facts — and the parsers in @cineforge/shared turn the output into
 * clock values. Decisions stay in the engine.
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { promisify } from "node:util";
import {
  parseBlackFrames,
  parseEbur128Summary,
  parseFrameRate,
  parseFreezes,
  parseSilences,
  secondsToUs,
  type Ebur128Summary,
  type FrameRate,
  type Interval,
  type Us,
} from "@cineforge/shared";

const run = promisify(execFile);

export function ebur128Args(input: string): string[] {
  return ["-hide_banner", "-nostats", "-i", input, "-filter_complex", "ebur128=peak=true", "-f", "null", "-"];
}

export function silenceArgs(input: string, noiseDb = -50, minSec = 0.1): string[] {
  return ["-hide_banner", "-nostats", "-i", input, "-af", `silencedetect=noise=${noiseDb}dB:d=${minSec}`, "-f", "null", "-"];
}

export function blackArgs(input: string, minSec = 0.04): string[] {
  return ["-hide_banner", "-nostats", "-i", input, "-vf", `blackdetect=d=${minSec}:pix_th=0.10`, "-an", "-f", "null", "-"];
}

export function freezeArgs(input: string, minSec = 0.5): string[] {
  return ["-hide_banner", "-nostats", "-i", input, "-vf", `freezedetect=n=-60dB:d=${minSec}`, "-an", "-f", "null", "-"];
}

async function stderrOf(args: string[]): Promise<string> {
  const { stderr } = await run("ffmpeg", args, { maxBuffer: 64 * 1024 * 1024 });
  return stderr;
}

export interface StreamFacts {
  hasVideo: boolean;
  hasAudio: boolean;
  durationUs: Us | null;
  frameRate: FrameRate | null;
  frameCount: number | null;
  sampleRate: number | null;
}

/** Duration, rate and frame count from ffprobe (frames counted, not estimated). */
export async function probeStreams(input: string): Promise<StreamFacts> {
  const { stdout } = await run("ffprobe", ["-v", "error", "-count_packets", "-show_entries",
    "stream=codec_type,avg_frame_rate,r_frame_rate,nb_read_packets,sample_rate:format=duration", "-of", "json", input]);
  const j = JSON.parse(stdout) as { streams?: Array<Record<string, string>>; format?: { duration?: string } };
  const v = j.streams?.find((s) => s.codec_type === "video");
  const a = j.streams?.find((s) => s.codec_type === "audio");
  let rate: FrameRate | null = null;
  try {
    rate = v ? parseFrameRate(v.avg_frame_rate && v.avg_frame_rate !== "0/0" ? v.avg_frame_rate : v.r_frame_rate!) : null;
  } catch {
    rate = null;
  }
  const frames = v?.nb_read_packets ? Number(v.nb_read_packets) : null;
  const durationUs = rate && frames
    ? (BigInt(frames) * 1_000_000n * BigInt(rate.den)) / BigInt(rate.num)
    : j.format?.duration ? secondsToUs(Number(j.format.duration)) : null;
  return { hasVideo: Boolean(v), hasAudio: Boolean(a), durationUs, frameRate: rate, frameCount: frames, sampleRate: a?.sample_rate ? Number(a.sample_rate) : null };
}

export async function measureLoudness(input: string): Promise<Ebur128Summary | null> {
  return parseEbur128Summary(await stderrOf(ebur128Args(input)));
}

export async function measureSilences(input: string, totalUs?: Us): Promise<Interval[]> {
  return parseSilences(await stderrOf(silenceArgs(input)), totalUs);
}

export async function measureBlack(input: string): Promise<Interval[]> {
  return parseBlackFrames(await stderrOf(blackArgs(input)));
}

export async function measureFreezes(input: string, totalUs?: Us): Promise<Interval[]> {
  return parseFreezes(await stderrOf(freezeArgs(input)), totalUs);
}

export async function sha256File(path: string): Promise<string> {
  const h = createHash("sha256");
  for await (const chunk of createReadStream(path)) h.update(chunk as Buffer);
  return h.digest("hex");
}
