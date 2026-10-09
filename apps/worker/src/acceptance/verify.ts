/**
 * Artifact verification for the real-provider tests and the film acceptance
 * test (W10). Every check reads the FILE — decoded with ffmpeg, measured with
 * ffprobe — never a provider's claim about it (DOS-70).
 */
import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { probeSize, probeStreams } from "../ffmpeg/analysis";
import { judgeClip } from "../quality/gates";
import { measureMedia } from "../quality/measure";
import { MASTER_TARGET, masterSegment, measureSpeech } from "../voice/mastering";

const run = promisify(execFile);

export class ArtifactError extends Error {
  constructor(message: string, readonly evidence: Record<string, unknown> = {}) {
    super(message);
    this.name = "ArtifactError";
  }
}

export type ImageFormat = "png" | "jpeg" | "webp";

/** The image format from the file's magic bytes, or null when it is not an image. */
export function imageFormat(b: Uint8Array): ImageFormat | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "webp";
  return null;
}

/** Population standard deviation of 8-bit samples. */
export function stddev(px: Uint8Array): number {
  if (!px.length) return 0;
  let sum = 0;
  for (const v of px) sum += v;
  const mean = sum / px.length;
  let sq = 0;
  for (const v of px) sq += (v - mean) ** 2;
  return Math.sqrt(sq / px.length);
}

/** The picture as 16×16 grey samples (decoded by ffmpeg). */
export async function thumbnailSamples(path: string): Promise<Uint8Array> {
  const { stdout } = await run("ffmpeg", ["-v", "error", "-i", path, "-frames:v", "1", "-vf", "scale=16:16,format=gray", "-f", "rawvideo", "-"], {
    encoding: "buffer", maxBuffer: 1024 * 1024,
  });
  return new Uint8Array(stdout as Buffer);
}

/** A generated still: a real image, decodable, of a usable size, with a picture on it. */
export async function verifyImage(bytes: Uint8Array, dir: string, minSide = 256): Promise<Record<string, unknown>> {
  const format = imageFormat(bytes);
  if (!format) throw new ArtifactError("the provider returned bytes that are not an image", { bytes: bytes.length });
  const path = join(dir, `probe.${format === "jpeg" ? "jpg" : format}`);
  await writeFile(path, bytes);
  const size = await probeSize(path).catch(() => null);
  if (!size) throw new ArtifactError(`the ${format} does not decode`, { format, bytes: bytes.length });
  const evidence = { format, bytes: bytes.length, width: size.width, height: size.height };
  if (Math.min(size.width, size.height) < minSide) throw new ArtifactError(`${size.width}×${size.height} is smaller than ${minSide}px`, evidence);
  const spread = stddev(await thumbnailSamples(path));
  if (spread < 2) throw new ArtifactError("the image is a flat colour", { ...evidence, spread });
  return { ...evidence, spread: +spread.toFixed(2) };
}

/**
 * A generated clip: readable video of the requested length and size that is
 * neither black nor frozen (technical QC in enforce mode), produced by a real
 * model (the runtime's execution report says so).
 */
export async function verifyClip(
  path: string,
  want: { durationSec: number; width: number; height: number },
  realExecution: boolean | undefined,
): Promise<Record<string, unknown>> {
  const facts = await measureMedia(path);
  const gate = judgeClip(facts, want, "enforce");
  const evidence = {
    readable: facts.readable, durationSec: facts.durationSec, width: facts.width, height: facts.height,
    black: facts.black, frozen: facts.frozen, sha256: facts.sha256, findings: gate.findings.map((f) => f.code), realExecution: realExecution ?? null,
  };
  if (realExecution !== true) throw new ArtifactError("the runtime did not report real model execution (placeholder or unknown)", evidence);
  if (gate.outcome === "fail") throw new ArtifactError(`technical QC failed: ${gate.findings.map((f) => f.code).join(", ")}`, evidence);
  return evidence;
}

/**
 * Generated audio: an audio stream of at least `minSec` that is not silence,
 * and that the mastering chain brings to the delivery target (−16 LUFS ±1).
 */
export async function verifyAudio(path: string, dir: string, minSec: number): Promise<Record<string, unknown>> {
  const streams = await probeStreams(path).catch(() => null);
  if (!streams?.hasAudio) throw new ArtifactError("the file has no audio stream");
  const raw = await measureSpeech(path);
  const evidence: Record<string, unknown> = { sampleRate: streams.sampleRate, durationSec: +raw.durationSec.toFixed(3), integratedLufs: raw.integratedLufs };
  if (raw.durationSec < minSec) throw new ArtifactError(`${raw.durationSec.toFixed(2)}s of audio (expected at least ${minSec}s)`, evidence);
  if (raw.integratedLufs === null || raw.integratedLufs < -50) throw new ArtifactError("the audio is silent", evidence);
  const mastered = join(dir, "mastered.wav");
  await masterSegment(path, mastered);
  const m = await measureSpeech(mastered);
  Object.assign(evidence, { masteredLufs: m.integratedLufs, masteredTruePeakDbtp: m.truePeakDbtp });
  if (m.integratedLufs === null || Math.abs(m.integratedLufs - MASTER_TARGET.integratedLufs) > 1) {
    throw new ArtifactError(`mastered to ${m.integratedLufs} LUFS (target ${MASTER_TARGET.integratedLufs} ±1)`, evidence);
  }
  return evidence;
}
