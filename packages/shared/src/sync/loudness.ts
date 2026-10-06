/**
 * LoudnessValidator (docs/38 §AU.7, §AW.9 delivery) and parsers for FFmpeg's
 * analysis filters. FFmpeg measures (it is the media-processing executor,
 * §AW.7); Cineforge decides.
 *
 *  - program loudness (the mix, eventKey "program") within ±loudnessLu of the
 *    delivery target, true peak at or below the delivery ceiling (clipping)
 *  - dialogue level consistency: lines more than 6 LU apart are flagged
 */
import { secondsToUs, type Us } from "../clock/time";
import type { SyncInput, SyncIssue } from "./types";

export interface Ebur128Summary {
  integratedLufs: number;
  lra: number;
  truePeakDbtp: number | null;
}

/** Parse the "Summary:" block FFmpeg's ebur128 filter prints at the end (peak=true for true peak). */
export function parseEbur128Summary(stderr: string): Ebur128Summary | null {
  const at = stderr.lastIndexOf("Summary:");
  if (at < 0) return null;
  const s = stderr.slice(at);
  const num = (re: RegExp) => {
    const m = re.exec(s);
    return m ? Number(m[1]) : null;
  };
  const i = num(/Integrated loudness:\s*\n\s*I:\s*(-?[\d.]+|-inf)\s*LUFS/);
  const lra = num(/Loudness range:\s*\n\s*LRA:\s*(-?[\d.]+)\s*LU/);
  const tp = num(/True peak:\s*\n\s*Peak:\s*(-?[\d.]+|-inf)\s*dBFS/);
  if (i === null || Number.isNaN(i)) return null;
  return { integratedLufs: i, lra: lra ?? 0, truePeakDbtp: tp === null || Number.isNaN(tp) ? null : tp };
}

export interface Interval { startUs: Us; endUs: Us }

function pairs(stderr: string, startRe: RegExp, endRe: RegExp, totalUs?: Us): Interval[] {
  const starts = [...stderr.matchAll(startRe)].map((m) => secondsToUs(Number(m[1])));
  const ends = [...stderr.matchAll(endRe)].map((m) => secondsToUs(Number(m[1])));
  return starts.map((s, i) => ({ startUs: s, endUs: ends[i] ?? totalUs ?? s }));
}

/** silencedetect: "silence_start: 1.234" … "silence_end: 2.5 | silence_duration: …". */
export function parseSilences(stderr: string, totalUs?: Us): Interval[] {
  return pairs(stderr, /silence_start:\s*(-?[\d.]+)/g, /silence_end:\s*(-?[\d.]+)/g, totalUs);
}

/** blackdetect: "black_start:0 black_end:0.5 black_duration:0.5". */
export function parseBlackFrames(stderr: string): Interval[] {
  return [...stderr.matchAll(/black_start:\s*([\d.]+)\s+black_end:\s*([\d.]+)/g)].map((m) => ({ startUs: secondsToUs(Number(m[1])), endUs: secondsToUs(Number(m[2])) }));
}

/** freezedetect: "lavfi.freezedetect.freeze_start: 1.5" / "freeze_end: 2.5". */
export function parseFreezes(stderr: string, totalUs?: Us): Interval[] {
  return pairs(stderr, /freeze_start:\s*([\d.]+)/g, /freeze_end:\s*([\d.]+)/g, totalUs);
}

export function validateLoudness(input: SyncInput): SyncIssue[] {
  const issues: SyncIssue[] = [];
  const target = input.policy.delivery;
  const tol = input.policy.tolerances.loudnessLu;
  const program = input.media.find((m) => m.eventKey === "program" && m.loudness);
  if (program?.loudness) {
    const { integratedLufs, truePeakDbtp } = program.loudness;
    const dev = integratedLufs - target.integratedLufs;
    if (Math.abs(dev) > tol) {
      issues.push({ check: "loudness", severity: Math.abs(dev) > 3 * tol ? "error" : "warning", atUs: 0n, spanUs: input.durationUs,
        measured: { integratedLufs }, expected: { integratedLufs: target.integratedLufs, toleranceLu: tol }, confidence: 1,
        message: `program loudness ${integratedLufs.toFixed(1)} LUFS, target ${target.integratedLufs} ±${tol} LU (${input.policy.id})`,
        repair: { kind: "normalize_loudness", targetLufs: target.integratedLufs, truePeakDbtp: target.truePeakDbtp } });
    }
    if (truePeakDbtp > target.truePeakDbtp) {
      issues.push({ check: "clipping", severity: truePeakDbtp > 0 ? "blocker" : "error", atUs: 0n, spanUs: input.durationUs,
        measured: { truePeakDbtp }, expected: { maxTruePeakDbtp: target.truePeakDbtp }, confidence: 1,
        message: `true peak ${truePeakDbtp.toFixed(1)} dBTP exceeds the ${target.truePeakDbtp} dBTP ceiling`,
        repair: { kind: "normalize_loudness", targetLufs: target.integratedLufs, truePeakDbtp: target.truePeakDbtp } });
    }
  }
  const events = new Map(input.events.map((e) => [e.key, e]));
  const dialogue = input.media.filter((m) => m.kind === "audio" && m.loudness && events.get(m.eventKey)?.kind === "dialogue");
  if (dialogue.length >= 2) {
    const levels = dialogue.map((d) => d.loudness!.integratedLufs);
    const median = [...levels].sort((a, b) => a - b)[Math.floor(levels.length / 2)]!;
    for (const d of dialogue) {
      const off = d.loudness!.integratedLufs - median;
      if (Math.abs(off) > 6) {
        const e = events.get(d.eventKey)!;
        issues.push({ check: "loudness", severity: "warning", eventId: d.eventKey, atUs: e.startUs, spanUs: e.endUs - e.startUs,
          measured: { integratedLufs: d.loudness!.integratedLufs }, expected: { medianLufs: median }, confidence: 0.9,
          message: `${d.eventKey} is ${off > 0 ? "+" : ""}${off.toFixed(1)} LU from the other dialogue` });
      }
    }
  }
  return issues;
}
