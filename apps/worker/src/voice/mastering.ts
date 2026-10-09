/**
 * Speech mastering (Part 4 §165): the model speaks, CineForge masters — outside
 * the model, the same for every engine. Each segment is trimmed of leading and
 * trailing silence, de-clicked, lightly denoised, normalised to -16 LUFS with
 * a -1.5 dBTP ceiling and written as 48 kHz mono 16-bit WAV. Segments are then
 * joined with a fixed pause, so a long script sounds like one take.
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ffmpeg } from "../ffmpeg/ffmpeg";
import { concatListContent } from "../ffmpeg/commands";
import { measureLoudness, probeStreams } from "../ffmpeg/analysis";

export const MASTER_TARGET = { integratedLufs: -16, truePeakDbtp: -1.5, sampleRate: 48000, channels: 1 } as const;
/** Pause between segments, ms. */
export const SEGMENT_GAP_MS = 250;

const TRIM = "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05";

/** The filter chain, in order (exported for the contract test). */
export function masteringFilter(): string {
  return [
    TRIM, "areverse", TRIM, "areverse",
    "adeclick",
    "afftdn=nf=-30",
    `loudnorm=I=${MASTER_TARGET.integratedLufs}:TP=${MASTER_TARGET.truePeakDbtp}:LRA=11`,
    `aresample=${MASTER_TARGET.sampleRate}`,
  ].join(",");
}

const WAV_OUT = ["-ac", String(MASTER_TARGET.channels), "-ar", String(MASTER_TARGET.sampleRate), "-c:a", "pcm_s16le"];

/** Master one raw engine output (mp3 or wav) into a 48 kHz mono WAV. */
export async function masterSegment(input: string, output: string): Promise<void> {
  await ffmpeg(["-i", input, "-af", masteringFilter(), ...WAV_OUT, output]);
}

/** Join mastered segments with a fixed pause into one WAV. */
export async function joinSegments(files: string[], output: string, dir: string, gapMs = SEGMENT_GAP_MS): Promise<void> {
  if (files.length === 1) {
    await ffmpeg(["-i", files[0]!, ...WAV_OUT, output]);
    return;
  }
  const gap = join(dir, "gap.wav");
  await ffmpeg(["-f", "lavfi", "-i", `anullsrc=r=${MASTER_TARGET.sampleRate}:cl=mono`, "-t", (gapMs / 1000).toFixed(3), ...WAV_OUT, gap]);
  const seq = files.flatMap((f, i) => (i ? [gap, f] : [f]));
  const list = join(dir, "segments.txt");
  await writeFile(list, concatListContent(seq));
  await ffmpeg(["-f", "concat", "-safe", "0", "-i", list, ...WAV_OUT, output]);
}

export interface SpeechMeasure {
  durationSec: number;
  integratedLufs: number | null;
  truePeakDbtp: number | null;
}

/** Duration and loudness of a mastered file (the job result reports what was delivered, not what was asked). */
export async function measureSpeech(path: string): Promise<SpeechMeasure> {
  const [streams, loud] = await Promise.all([probeStreams(path), measureLoudness(path).catch(() => null)]);
  return {
    durationSec: streams.durationUs === null ? 0 : Number(streams.durationUs) / 1e6,
    integratedLufs: loud?.integratedLufs ?? null,
    truePeakDbtp: loud?.truePeakDbtp ?? null,
  };
}
