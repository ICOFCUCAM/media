/**
 * Sync tolerance calibration (W10; docs/38 §AU.9 "values to be confirmed").
 *
 * The A/V Sync Engine judges media by what FFmpeg measures. A tolerance only
 * means something if the instruments can resolve it: a ±40 ms gate fed by a
 * measurement that wobbles ±50 ms decides by noise. This calibration makes
 * media with KNOWN truth (exact frame counts, silence of known length before a
 * tone, a flash and a beep a known offset apart, the same signal at known gain
 * steps), measures it with the engine's own functions (../ffmpeg/analysis),
 * and reports the error distribution per dimension. Every tolerance of every
 * profile is then checked against the noise floor:
 *
 *   RESOLVED       tolerance ≥ 3 × p95 measurement error
 *   MARGINAL       tolerance ≥ p95 error but < 3 ×
 *   UNRESOLVABLE   tolerance < p95 error — the gate measures noise
 *
 * This is INSTRUMENT calibration. Whether a tolerance is right for viewers
 * (perceptual calibration) is a separate, human judgement; `calibrated` on a
 * sync policy stays false until both are done.
 */
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { DEFAULT_SYNC_POLICIES, type SyncPolicy, type SyncTolerances } from "@cineforge/shared";
import { measureBlack, measureLoudness, measureSilences, probeStreams } from "../ffmpeg/analysis";

const run = promisify(execFile);
const ff = (args: string[]) => run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);

export type Dimension = "video_duration" | "audio_duration" | "onset" | "offset" | "av_offset" | "loudness";

export interface Sample {
  dimension: Dimension;
  label: string;
  truth: number;
  measured: number | null;
  /** |measured − truth| in µs (LU for loudness); null when nothing was measured. */
  error: number | null;
}

export interface ErrorStats {
  n: number;
  failed: number;
  p50: number;
  p95: number;
  max: number;
}

export type Verdict = "RESOLVED" | "MARGINAL" | "UNRESOLVABLE";

export interface ToleranceVerdict {
  profile: string;
  tolerance: keyof SyncTolerances;
  value: number;
  /** The measurement noise this tolerance is judged by (µs, or LU). */
  noiseP95: number;
  verdict: Verdict;
  /** Smallest tolerance the instruments resolve (3 × p95), rounded up to the ms (or 0.1 LU). */
  minimumResolved: number;
}

export interface CalibrationReport {
  tool: string;
  samples: Sample[];
  stats: Record<Dimension, ErrorStats>;
  verdicts: ToleranceVerdict[];
  unresolvable: ToleranceVerdict[];
}

/** Which measurement each tolerance depends on. */
export const TOLERANCE_DIMENSION: Record<keyof SyncTolerances, Dimension> = {
  durationUs: "video_duration",
  driftUs: "video_duration",
  dialogueStartUs: "onset",
  dialogueEndUs: "offset",
  musicCueUs: "onset",
  sfxUs: "onset",
  subtitleUs: "onset",
  lipSyncLeadUs: "av_offset",
  lipSyncLagUs: "av_offset",
  loudnessLu: "loudness",
};

const quantile = (xs: number[], q: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)]!;
};

export function errorStats(samples: Sample[]): Record<Dimension, ErrorStats> {
  const dims: Dimension[] = ["video_duration", "audio_duration", "onset", "offset", "av_offset", "loudness"];
  return Object.fromEntries(dims.map((d) => {
    const xs = samples.filter((s) => s.dimension === d);
    const errs = xs.map((s) => s.error).filter((e): e is number => e !== null);
    return [d, { n: xs.length, failed: xs.length - errs.length, p50: quantile(errs, 0.5), p95: quantile(errs, 0.95), max: errs.length ? Math.max(...errs) : 0 }];
  })) as Record<Dimension, ErrorStats>;
}

export function judgeTolerances(stats: Record<Dimension, ErrorStats>, policies: SyncPolicy[] = Object.values(DEFAULT_SYNC_POLICIES)): ToleranceVerdict[] {
  const out: ToleranceVerdict[] = [];
  for (const p of policies) {
    for (const [name, dim] of Object.entries(TOLERANCE_DIMENSION) as [keyof SyncTolerances, Dimension][]) {
      const raw = p.tolerances[name];
      const value = typeof raw === "bigint" ? Number(raw) : raw;
      const s = stats[dim];
      // A dimension whose measurements failed has unbounded noise.
      const noise = s.failed ? Number.POSITIVE_INFINITY : s.p95;
      const verdict: Verdict = value >= 3 * noise ? "RESOLVED" : value >= noise ? "MARGINAL" : "UNRESOLVABLE";
      const step = name === "loudnessLu" ? 0.1 : 1000;
      const minimumResolved = Number.isFinite(noise) ? Math.max(step, Math.ceil(+((3 * noise) / step).toFixed(6)) * step) : Number.POSITIVE_INFINITY;
      out.push({ profile: String(p.id), tolerance: name, value, noiseP95: noise, verdict, minimumResolved: +minimumResolved.toFixed(2) });
    }
  }
  return out;
}

const US = 1_000_000;
const err = (truth: number, measured: number | null) => (measured === null ? null : Math.abs(measured - truth));

/** Make the known-truth media and measure it. ~30 short files; a few seconds of CPU. */
export async function measureInstruments(dir: string): Promise<Sample[]> {
  const samples: Sample[] = [];

  // Video duration: exact frame counts at the rates models deliver and masters use.
  for (const fps of [16, 24, 25, 30]) {
    for (const frames of [33, 80, 121]) {
      const f = join(dir, `v_${fps}_${frames}.mp4`);
      await ff(["-f", "lavfi", "-i", `testsrc2=size=320x240:rate=${fps}`, "-frames:v", String(frames), "-c:v", "libx264", "-pix_fmt", "yuv420p", f]);
      const truth = Math.round((frames / fps) * US);
      const d = (await probeStreams(f)).durationUs;
      const measured = d === null ? null : Number(d);
      samples.push({ dimension: "video_duration", label: `${frames} frames @ ${fps} fps`, truth, measured, error: err(truth, measured) });
    }
  }

  // Audio duration, onset and end of speech: silence of known length, a tone, silence — in the formats engines deliver.
  for (const [ext, rate, codec] of [["wav", 48000, "pcm_s16le"], ["mp3", 24000, "libmp3lame"], ["m4a", 48000, "aac"]] as const) {
    for (const lead of [0.12, 0.25, 0.5, 0.77, 1.0]) {
      const tone = 1.5;
      const tail = 0.6;
      const total = lead + tone + tail;
      const f = join(dir, `a_${ext}_${lead}.${ext}`);
      // Speech-like: a 30 ms attack and 80 ms release over a quiet room (pink noise ≈ −66 dBFS), not digital silence.
      await ff([
        "-f", "lavfi", "-i", `sine=frequency=330:sample_rate=${rate}:duration=${tone}`,
        "-f", "lavfi", "-i", `anoisesrc=color=pink:amplitude=0.0005:sample_rate=${rate}:duration=${total}:seed=3`,
        "-filter_complex",
        `[0]volume=0.5,afade=t=in:d=0.03,afade=t=out:st=${tone - 0.08}:d=0.08,adelay=${Math.round(lead * 1000)}:all=1,apad=whole_dur=${total}[s];[s][1]amix=inputs=2:normalize=0`,
        "-ac", "1", "-c:a", codec, f,
      ]);
      const streams = await probeStreams(f);
      const dur = streams.durationUs === null ? null : Number(streams.durationUs);
      samples.push({ dimension: "audio_duration", label: `${ext} ${total.toFixed(2)}s`, truth: Math.round(total * US), measured: dur, error: err(Math.round(total * US), dur) });
      const silences = await measureSilences(f, streams.durationUs ?? undefined);
      const head = silences.find((s) => s.startUs <= 20_000n);
      const end = silences.find((s) => Number(s.startUs) > lead * US + 100_000);
      const onset = head ? Number(head.endUs) : null;
      const offset = end ? Number(end.startUs) : null;
      samples.push({ dimension: "onset", label: `${ext} lead ${lead}s`, truth: Math.round(lead * US), measured: onset, error: err(Math.round(lead * US), onset) });
      samples.push({ dimension: "offset", label: `${ext} end ${(lead + tone).toFixed(2)}s`, truth: Math.round((lead + tone) * US), measured: offset, error: err(Math.round((lead + tone) * US), offset) });
    }
  }

  // A/V offset: a white flash and a beep a known distance apart, muxed as a delivered clip (H.264 + AAC).
  // The flash is on a frame boundary (picture can only change there); the beep lands anywhere (audio is sample-accurate).
  for (const fps of [16, 24, 25]) {
    for (const d of [-0.083, -0.037, 0.011, 0.043, 0.121]) {
      const flash = 1.0;
      const beep = flash + d;
      const f = join(dir, `av_${fps}_${d}.mp4`);
      await ff([
        "-f", "lavfi", "-i", `color=c=black:size=320x240:rate=${fps}:duration=3`,
        "-f", "lavfi", "-i", `sine=frequency=1000:sample_rate=48000:duration=0.2`,
        "-filter_complex",
        `[0]drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='between(t,${flash},${flash + 0.2})'[v];` +
        `[1]volume=0.5,afade=t=in:d=0.01,adelay=${Math.round(beep * 1000)}:all=1,apad=whole_dur=3[n];` +
        `anoisesrc=color=pink:amplitude=0.0005:sample_rate=48000:duration=3:seed=5[r];[n][r]amix=inputs=2:normalize=0[a]`,
        "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-t", "3", f,
      ]);
      const blacks = await measureBlack(f);
      const firstBlack = blacks.find((b) => b.startUs <= 50_000n);
      const sil = await measureSilences(f);
      const head = sil.find((s) => s.startUs <= 20_000n);
      const measured = firstBlack && head ? Number(head.endUs) - Number(firstBlack.endUs) : null;
      const truth = Math.round(d * US);
      samples.push({ dimension: "av_offset", label: `${fps} fps, audio ${d >= 0 ? "+" : ""}${d}s`, truth, measured, error: err(truth, measured) });
    }
  }

  // Loudness: one programme at known gain steps; the measured difference must equal the gain difference.
  const base = join(dir, "l_base.wav");
  await ff(["-f", "lavfi", "-i", "anoisesrc=color=pink:amplitude=0.25:sample_rate=48000:duration=8:seed=7", "-ac", "1", base]);
  const ref = await measureLoudness(base);
  for (const gain of [-3, -6, -9, -12, -18]) {
    const f = join(dir, `l_${-gain}.wav`);
    await ff(["-i", base, "-af", `volume=${gain}dB`, f]);
    const m = await measureLoudness(f);
    const measured = ref && m ? +(m.integratedLufs - ref.integratedLufs).toFixed(2) : null;
    samples.push({ dimension: "loudness", label: `${gain} dB`, truth: gain, measured, error: measured === null ? null : +Math.abs(measured - gain).toFixed(2) });
  }
  return samples;
}

export async function ffmpegVersion(): Promise<string> {
  const { stdout } = await run("ffmpeg", ["-version"]);
  return stdout.split("\n")[0]!.trim();
}

export async function calibrate(dir: string, policies?: SyncPolicy[]): Promise<CalibrationReport> {
  const samples = await measureInstruments(dir);
  const stats = errorStats(samples);
  const verdicts = judgeTolerances(stats, policies);
  return { tool: await ffmpegVersion(), samples, stats, verdicts, unresolvable: verdicts.filter((v) => v.verdict === "UNRESOLVABLE") };
}

export function formatCalibration(r: CalibrationReport): string {
  const ms = (us: number) => `${(us / 1000).toFixed(1)} ms`;
  const lines = [`instrument: ${r.tool}`];
  for (const [d, s] of Object.entries(r.stats)) {
    const f = d === "loudness" ? (x: number) => `${x.toFixed(2)} LU` : ms;
    lines.push(`${d.padEnd(15)} n=${s.n}${s.failed ? ` (${s.failed} unmeasured)` : ""}  p50 ${f(s.p50)}  p95 ${f(s.p95)}  max ${f(s.max)}`);
  }
  const counts = (v: Verdict) => r.verdicts.filter((x) => x.verdict === v).length;
  lines.push(`tolerances: ${counts("RESOLVED")} resolved, ${counts("MARGINAL")} marginal, ${counts("UNRESOLVABLE")} unresolvable (of ${r.verdicts.length})`);
  for (const v of r.verdicts.filter((x) => x.verdict !== "RESOLVED")) {
    const f = v.tolerance === "loudnessLu" ? (x: number) => `${x} LU` : ms;
    lines.push(`${v.verdict.padEnd(12)} ${v.profile}.${v.tolerance} = ${f(v.value)} (noise p95 ${f(v.noiseP95)}; resolved from ${f(v.minimumResolved)})`);
  }
  lines.push(`SYNC_INSTRUMENT_CALIBRATION: ${r.unresolvable.length ? "UNRESOLVABLE_TOLERANCES" : "PASS"}`);
  return lines.join("\n");
}
