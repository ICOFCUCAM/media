/**
 * Quality gates (DirectorOS Part 1 §39–40, Part 2 §70 "never self-certify";
 * W5). Pure judges over measured media facts — measurement lives in
 * ./measure.ts, so these are testable without ffmpeg.
 *
 * Severity of a finding:
 *   fatal  the artifact is not a usable video (unreadable, no picture, empty):
 *          it never becomes READY, whatever the mode
 *   fail   a clear defect (black, frozen, badly truncated, no sound where the
 *          film has sound): recorded in `record` mode, regenerated / failed in
 *          `enforce` mode (QUALITY_GATES)
 *   warn   worth knowing (slightly short, loudness off target, a long black run)
 *
 * The gate chain of a film (§39): story → visual → continuity → audio →
 * technical → editorial. Every result is recorded (quality_gate_results).
 */

export type GateName = "story" | "visual" | "continuity" | "audio" | "technical" | "editorial";
export type GateOutcome = "pass" | "warn" | "fail" | "skipped";
export type FindingSeverity = "fatal" | "fail" | "warn";

export interface GateFinding {
  code: string;
  severity: FindingSeverity;
  message: string;
  detail?: Record<string, unknown>;
}

export interface GateResult {
  gate: GateName;
  outcome: GateOutcome;
  findings: GateFinding[];
}

export type QualityMode = "record" | "enforce";
export function qualityMode(env: Record<string, string | undefined> = process.env): QualityMode {
  return env.QUALITY_GATES === "enforce" ? "enforce" : "record";
}

/** Measured facts of a clip or master, in seconds. */
export interface MediaFacts {
  readable: boolean;
  hasVideo: boolean;
  hasAudio: boolean;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  /** Black-picture intervals [start, end) in seconds. */
  black: [number, number][];
  /** Frozen-picture intervals. */
  frozen: [number, number][];
  /** Integrated loudness and true peak (masters with audio). */
  loudness?: { integratedLufs: number; truePeakDbtp: number | null } | null;
  sha256?: string;
}

const covered = (iv: [number, number][]) => iv.reduce((a, [s, e]) => a + Math.max(0, e - s), 0);
const longest = (iv: [number, number][]) => iv.reduce((a, [s, e]) => Math.max(a, e - s), 0);

export function outcomeOf(findings: GateFinding[], mode: QualityMode): GateOutcome {
  if (findings.some((f) => f.severity === "fatal")) return "fail";
  if (findings.some((f) => f.severity === "fail")) return mode === "enforce" ? "fail" : "warn";
  return findings.length ? "warn" : "pass";
}

/** Technical QC of one generated clip against what was requested. */
export function judgeClip(f: MediaFacts, want: { durationSec: number; width: number; height: number }, mode: QualityMode): GateResult {
  const out: GateFinding[] = [];
  const F = (code: string, severity: FindingSeverity, message: string, detail?: Record<string, unknown>) => out.push({ code, severity, message, detail });
  if (!f.readable) F("CLIP_UNREADABLE", "fatal", "the clip cannot be read");
  else if (!f.hasVideo) F("CLIP_NO_VIDEO", "fatal", "the clip has no video stream");
  else if (!f.durationSec || f.durationSec <= 0) F("CLIP_EMPTY", "fatal", "the clip has no duration");
  else {
    const d = f.durationSec;
    const ratio = d / want.durationSec;
    if (ratio < 0.6) F("CLIP_TRUNCATED", "fail", `${d.toFixed(2)}s of ${want.durationSec}s requested`, { durationSec: d });
    else if (ratio < 0.9) F("CLIP_SHORT", "warn", `${d.toFixed(2)}s of ${want.durationSec}s requested`, { durationSec: d });
    const black = covered(f.black) / d;
    if (black >= 0.95) F("CLIP_BLACK", "fail", "the picture is black", { share: +black.toFixed(3) });
    else if (black > 0.3) F("CLIP_MOSTLY_BLACK", "warn", `${Math.round(black * 100)}% of the clip is black`, { share: +black.toFixed(3) });
    const frozen = covered(f.frozen) / d;
    if (frozen >= 0.9) F("CLIP_FROZEN", "fail", "the picture does not move", { share: +frozen.toFixed(3) });
    else if (frozen > 0.4) F("CLIP_MOSTLY_FROZEN", "warn", `${Math.round(frozen * 100)}% of the clip is frozen`, { share: +frozen.toFixed(3) });
    if (f.width && f.height && (f.width < want.width * 0.9 || f.height < want.height * 0.9)) {
      F("CLIP_UNDERSIZED", "warn", `${f.width}×${f.height} delivered for ${want.width}×${want.height}`, { width: f.width, height: f.height });
    }
  }
  return { gate: "technical", outcome: outcomeOf(out, mode), findings: out };
}

/** Final Quality Gate of the assembled master: technical + audio. */
export function judgeMaster(
  f: MediaFacts,
  want: { durationSec: number; hasSound: boolean; integratedLufs: number; truePeakMaxDbtp: number },
  mode: QualityMode,
): GateResult[] {
  const tech: GateFinding[] = [];
  const audio: GateFinding[] = [];
  const T = (code: string, severity: FindingSeverity, message: string, detail?: Record<string, unknown>) => tech.push({ code, severity, message, detail });
  const A = (code: string, severity: FindingSeverity, message: string, detail?: Record<string, unknown>) => audio.push({ code, severity, message, detail });
  if (!f.readable) T("MASTER_UNREADABLE", "fatal", "the master cannot be read");
  else if (!f.hasVideo) T("MASTER_NO_VIDEO", "fatal", "the master has no video stream");
  else if (!f.durationSec || f.durationSec <= 0) T("MASTER_EMPTY", "fatal", "the master has no duration");
  else {
    const d = f.durationSec;
    const off = Math.abs(d - want.durationSec);
    if (d < want.durationSec * 0.5) T("MASTER_TRUNCATED", "fail", `${d.toFixed(1)}s for a ${want.durationSec}s film`, { durationSec: d });
    else if (off > Math.max(2, want.durationSec * 0.1)) T("MASTER_LENGTH", "warn", `${d.toFixed(1)}s for a ${want.durationSec}s film`, { durationSec: d });
    // Fades at the head and tail are fine; a black run inside the film is not.
    const inner = f.black.filter(([s, e]) => s > 1 && e < d - 1);
    if (longest(inner) > 2) T("MASTER_BLACK_RUN", "warn", `a ${longest(inner).toFixed(1)}s black run inside the film`);
    if (longest(f.frozen) > 3) T("MASTER_FROZEN_RUN", "warn", `a ${longest(f.frozen).toFixed(1)}s frozen run`);
  }
  if (f.readable && f.hasVideo) {
    if (want.hasSound && !f.hasAudio) A("MASTER_SILENT", "fail", "the film should have sound but the master has no audio");
    else if (f.hasAudio && f.loudness) {
      const lu = f.loudness.integratedLufs;
      if (Math.abs(lu - want.integratedLufs) > 2) A("LOUDNESS_OFF_TARGET", "warn", `${lu.toFixed(1)} LUFS (target ${want.integratedLufs})`, { integratedLufs: lu });
      if (f.loudness.truePeakDbtp !== null && f.loudness.truePeakDbtp > want.truePeakMaxDbtp) {
        A("TRUE_PEAK_HIGH", "warn", `true peak ${f.loudness.truePeakDbtp.toFixed(1)} dBTP (max ${want.truePeakMaxDbtp})`);
      }
    } else if (f.hasAudio) A("LOUDNESS_UNMEASURED", "warn", "loudness could not be measured");
  }
  return [
    { gate: "technical", outcome: outcomeOf(tech, mode), findings: tech },
    { gate: "audio", outcome: f.readable && f.hasVideo ? outcomeOf(audio, mode) : "skipped", findings: audio },
  ];
}

/** True when a result must stop the shot / film (fatal always; fail in enforce mode). */
export function blocks(r: GateResult): boolean {
  return r.outcome === "fail";
}

/** One-line summary for logs and failure messages. */
export function summary(r: GateResult): string {
  return r.findings.map((f) => `${f.code}: ${f.message}`).join("; ") || r.outcome;
}

export type ShotDecision = { action: "accept" } | { action: "regenerate"; reason: string } | { action: "fail"; reason: string };

/**
 * What to do with a generated shot after its gates. A blocking result
 * regenerates the shot with a new seed while attempts remain (bounded by the
 * job's attempts), then fails it. Nothing blocking → accept.
 */
export function decideShot(results: GateResult[], attempt: { made: number; max: number }): ShotDecision {
  const blocking = results.filter(blocks);
  if (!blocking.length) return { action: "accept" };
  const reason = blocking.map((r) => `${r.gate}: ${summary(r)}`).join(" | ").slice(0, 450);
  return attempt.made + 1 < attempt.max ? { action: "regenerate", reason } : { action: "fail", reason };
}
