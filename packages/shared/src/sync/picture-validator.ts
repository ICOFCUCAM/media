/**
 * Picture integrity (docs/38 §AU.7 checks black_frames and dropped_frames):
 * black and frozen stretches inside placed clips, from FFmpeg's blackdetect /
 * freezedetect. A frozen stretch in a generated clip is how a dropped or
 * duplicated run of frames shows up — and how a silent "hold last frame"
 * re-timing would show up if a runtime did one without reporting it.
 *
 * Planned holds (a hold_last_frame repair, a 'title' or 'transition' event)
 * are not defects: intervals covered by such an event are ignored.
 */
import type { Us } from "../clock/time";
import { secs, type SyncInput, type SyncIssue } from "./types";

export function validatePicture(input: SyncInput): SyncIssue[] {
  const issues: SyncIssue[] = [];
  const events = new Map(input.events.map((e) => [e.key, e]));
  const planned = input.events.filter((e) => e.kind === "title" || e.kind === "transition" || e.payload?.plannedHold === true);
  const isPlanned = (s: Us, e: Us) => planned.some((p) => p.startUs <= s && p.endUs >= e);
  const frame = (BigInt(input.fps.den) * 1_000_000n) / BigInt(input.fps.num);
  const freezeLimit = input.policy.repair.maxHoldUs;

  for (const m of input.media.filter((x) => x.kind === "video")) {
    const e = events.get(m.eventKey);
    if (!e) continue;
    const shotId = e.kind === "shot" ? e.refId : undefined;
    for (const b of m.blackIntervals ?? []) {
      const s = e.startUs + b.startUs;
      const end = e.startUs + b.endUs;
      if (end - s < frame || isPlanned(s, end)) continue;
      issues.push({ check: "black_frames", severity: end - s > 10n * frame ? "error" : "warning", shotId, eventId: m.eventKey, atUs: s, spanUs: end - s,
        measured: { blackUs: Number(end - s) }, expected: { blackUs: 0 }, confidence: 0.95,
        message: `${m.eventKey}: ${secs(end - s)} of black picture at ${secs(b.startUs)} into the clip`,
        ...(shotId ? { repair: { kind: "regenerate_shot" as const, shotId, durationUs: e.endUs - e.startUs, reason: "black frames in generated clip" } } : {}) });
    }
    for (const f of m.freezeIntervals ?? []) {
      const s = e.startUs + f.startUs;
      const end = e.startUs + f.endUs;
      if (isPlanned(s, end)) continue;
      const len = end - s;
      issues.push({ check: "dropped_frames", severity: len > freezeLimit ? "error" : "warning", shotId, eventId: m.eventKey, atUs: s, spanUs: len,
        measured: { frozenUs: Number(len) }, expected: { frozenUs: 0 }, confidence: 0.8,
        message: `${m.eventKey}: picture frozen for ${secs(len)} at ${secs(f.startUs)} into the clip — dropped/duplicated frames or an unreported hold`,
        ...(shotId && len > freezeLimit ? { repair: { kind: "regenerate_shot" as const, shotId, durationUs: e.endUs - e.startUs, reason: "frozen picture" } } : {}) });
    }
  }
  return issues;
}
