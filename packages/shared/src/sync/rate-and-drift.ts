/**
 * FrameRateValidator and DriftDetector (docs/38 §AU.7).
 *
 * FrameRateValidator — placed video is at the production rate, or carries a
 * recorded conform (the render converts it once, per the clock's plan). A
 * different rate with no recorded conform would be re-timed implicitly:
 * that is an error.
 *
 * DriftDetector — a constant A/V offset is a lip-sync matter; an offset that
 * GROWS along the timeline is drift (a rate or conform error accumulating).
 * The detector fits a least-squares line to the measured offsets against
 * their clock positions and flags the change it predicts across the measured
 * span when that exceeds policy.driftUs.
 */
import { formatFrameRate, sameRate } from "../clock/rational";
import type { Us } from "../clock/time";
import { secs, type SyncInput, type SyncIssue } from "./types";

export function validateFrameRates(input: SyncInput): SyncIssue[] {
  const issues: SyncIssue[] = [];
  const events = new Map(input.events.map((e) => [e.key, e]));
  for (const m of input.media.filter((x) => x.kind === "video" && x.frameRate)) {
    if (sameRate(m.frameRate!, input.fps)) continue;
    const e = events.get(m.eventKey);
    const at = e?.startUs ?? 0n;
    const shotId = e?.kind === "shot" ? e.refId : undefined;
    const from = formatFrameRate(m.frameRate!);
    const to = formatFrameRate(input.fps);
    if (m.conformRecorded) {
      issues.push({ check: "frame_rate", severity: "info", shotId, eventId: m.eventKey, atUs: at, measured: { fps: m.frameRate!.num / m.frameRate!.den }, expected: { fps: input.fps.num / input.fps.den }, confidence: 1,
        message: `${m.eventKey}: ${from} source, conformed to ${to} by its recorded plan` });
    } else {
      issues.push({ check: "frame_rate", severity: "error", shotId, eventId: m.eventKey, atUs: at, measured: { fps: m.frameRate!.num / m.frameRate!.den }, expected: { fps: input.fps.num / input.fps.den }, confidence: 1,
        message: `${m.eventKey}: ${from} media on a ${to} timeline with no recorded conform — it would be re-timed implicitly`,
        repair: m.mediaVersionId ? { kind: "conform_frame_rate", mediaVersionId: m.mediaVersionId, toFps: to } : { kind: "human_review", reason: "conform without a media version" } });
    }
  }
  return issues;
}

export function detectDrift(input: SyncInput): SyncIssue[] {
  const events = new Map(input.events.map((e) => [e.key, e]));
  const pts = input.media
    .filter((m) => m.offsetUs !== undefined && events.has(m.eventKey))
    .map((m) => ({ x: Number(events.get(m.eventKey)!.startUs), y: Number(m.offsetUs!) }))
    .sort((a, b) => a.x - b.x);
  if (pts.length < 3) return [];
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  const sxx = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  if (sxx === 0) return [];
  const slope = pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / sxx; // µs of offset per µs of timeline
  const span = pts[n - 1]!.x - pts[0]!.x;
  const accumulated = BigInt(Math.round(slope * span));
  const abs: Us = accumulated < 0n ? -accumulated : accumulated;
  if (abs <= input.policy.tolerances.driftUs) return [];
  const perMinuteMs = slope * 60_000_000 / 1000;
  return [{
    check: "drift", severity: abs > 4n * input.policy.tolerances.driftUs ? "blocker" : "error",
    atUs: BigInt(pts[0]!.x), spanUs: BigInt(span),
    measured: { accumulatedUs: Number(accumulated), msPerMinute: Number(perMinuteMs.toFixed(3)), samples: n },
    expected: { maxAccumulatedUs: Number(input.policy.tolerances.driftUs) },
    confidence: n >= 5 ? 0.9 : 0.7,
    message: `A/V offset drifts by ${secs(accumulated)} across ${secs(BigInt(span))} (${perMinuteMs.toFixed(1)} ms/min) — check frame-rate conform and audio sample rate`,
    repair: { kind: "human_review", reason: "progressive drift: find the rate mismatch before repairing shots" },
  }];
}
