/**
 * Reference-recording analysis (Part 4 §160–161): measured with ffmpeg on the
 * real file, then judged by @cineforge/voice-contracts before any voice is
 * created from it. One decode pass gives 50 ms windows of RMS and peak level;
 * silence share, peak and noise floor all come from those windows.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { VoiceSampleFacts } from "@cineforge/voice-contracts";

const run = promisify(execFile);

/** Windows quieter than this count as silence. */
export const SILENCE_DBFS = -45;

export interface LevelWindow {
  rmsDbfs: number;
  peakDbfs: number;
}

/** Parse `ametadata=print` output of astats: one window per `frame:` block. Digital silence reads -inf. */
export function parseLevelWindows(text: string): LevelWindow[] {
  const out: LevelWindow[] = [];
  let cur: { rms?: number; peak?: number } = {};
  const flush = () => {
    if (cur.rms !== undefined && cur.peak !== undefined) out.push({ rmsDbfs: cur.rms, peakDbfs: cur.peak });
    cur = {};
  };
  for (const line of text.split("\n")) {
    if (line.startsWith("frame:")) { flush(); continue; }
    const m = /lavfi\.astats\.Overall\.(RMS_level|Peak_level)=(\S+)/.exec(line);
    if (!m) continue;
    const v = m[2] === "-inf" ? -120 : Number(m[2]);
    if (!Number.isFinite(v)) continue;
    if (m[1] === "RMS_level") cur.rms = v;
    else cur.peak = v;
  }
  flush();
  return out;
}

/** Silence share, peak and noise floor (10th percentile of window RMS among non-digital-silence windows). */
export function summarizeWindows(windows: LevelWindow[]): Pick<VoiceSampleFacts, "silenceRatio" | "peakDbfs" | "noiseFloorDbfs"> {
  if (!windows.length) return { silenceRatio: 1, peakDbfs: -120, noiseFloorDbfs: null };
  const silent = windows.filter((w) => w.rmsDbfs < SILENCE_DBFS).length;
  const audible = windows.map((w) => w.rmsDbfs).filter((r) => r > -100).sort((a, b) => a - b);
  const floor = audible.length >= 10 ? audible[Math.floor(audible.length * 0.1)]! : null;
  return {
    silenceRatio: silent / windows.length,
    peakDbfs: Math.max(...windows.map((w) => w.peakDbfs)),
    noiseFloorDbfs: floor,
  };
}

/** Measure a local recording. Throws when the file has no audio stream. */
export async function analyzeVoiceSample(path: string): Promise<VoiceSampleFacts> {
  const { stdout: probe } = await run("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries",
    "stream=sample_rate,channels:format=duration", "-of", "json", path]);
  const j = JSON.parse(probe) as { streams?: Array<{ sample_rate?: string; channels?: number }>; format?: { duration?: string } };
  const a = j.streams?.[0];
  if (!a) throw new Error("the recording has no audio");
  const { stdout } = await run("ffmpeg", ["-hide_banner", "-nostats", "-i", path, "-af",
    "aformat=channel_layouts=mono,asetnsamples=n=2400:p=0,astats=metadata=1:reset=1,ametadata=mode=print:file=-",
    "-f", "null", "-"], { maxBuffer: 256 * 1024 * 1024 });
  return {
    durationSec: Number(j.format?.duration ?? 0),
    sampleRate: Number(a.sample_rate ?? 0),
    channels: Number(a.channels ?? 0),
    ...summarizeWindows(parseLevelWindows(stdout)),
  };
}
