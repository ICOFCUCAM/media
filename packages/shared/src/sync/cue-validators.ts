/**
 * MusicCueValidator and SFXCueValidator (docs/38 §AU.7, §AU.11). Anchor
 * positions themselves are checked by the TimelineAnalyzer; these check that
 * cues are attached to something that will keep them in place:
 *
 *  music  entries and exits land on a structural point — a scene boundary, a
 *         cut, or the event they are anchored to — within policy.musicCueUs.
 *         Music merely "placed under the video" drifts off its intent the
 *         first time a shot is re-timed.
 *  sfx    every effect is anchored (action, cut, start/end of an event); an
 *         unanchored effect is not moved when its shot changes and will be
 *         displaced.
 */
import type { Us } from "../clock/time";
import { secs, type SyncInput, type SyncIssue } from "./types";

const near = (a: Us, b: Us, tol: Us) => (a > b ? a - b : b - a) <= tol;

export function validateCues(input: SyncInput): SyncIssue[] {
  const issues: SyncIssue[] = [];
  const tol = input.policy.tolerances.musicCueUs;
  const boundaries = new Set<bigint>([0n, input.durationUs]);
  for (const e of input.events) {
    if (e.kind === "scene" || e.kind === "shot") {
      boundaries.add(e.startUs);
      boundaries.add(e.endUs);
    }
  }
  const points = [...boundaries];
  const onStructure = (us: Us) => points.some((p) => near(us, p, tol));
  const anchored = new Set(input.events.filter((e) => e.anchor).map((e) => e.key));

  const music = [
    ...input.events.filter((e) => e.kind === "music_cue").map((e) => ({ key: e.key, startUs: e.startUs, endUs: e.endUs, anchored: anchored.has(e.key) })),
    ...input.audio.filter((a) => a.stem === "music").map((a) => ({ key: a.key, startUs: a.startUs, endUs: a.endUs, anchored: Boolean(a.eventKey && anchored.has(a.eventKey)) })),
  ];
  for (const m of music) {
    if (m.anchored) continue;
    for (const [edge, us] of [["enters", m.startUs], ["exits", m.endUs]] as const) {
      if (!onStructure(us)) {
        const nearest = points.reduce((best, p) => ((p > us ? p - us : us - p) < (best > us ? best - us : us - best) ? p : best), points[0]!);
        issues.push({ check: "music_cue", severity: "warning", eventId: m.key, atUs: us, spanUs: nearest > us ? nearest - us : us - nearest,
          measured: { atUs: Number(us) }, expected: { nearestBoundaryUs: Number(nearest) }, confidence: 0.8,
          message: `${m.key} ${edge} ${secs(nearest > us ? nearest - us : us - nearest)} away from any scene boundary or cut, unanchored`,
          repair: { kind: "reanchor", eventId: m.key, anchorKey: "nearest scene boundary or cut" } });
      }
    }
  }

  for (const s of input.events.filter((e) => e.kind === "sfx")) {
    if (!s.anchor) {
      issues.push({ check: "sfx_cue", severity: "warning", eventId: s.key, atUs: s.startUs, measured: {}, expected: {}, confidence: 1,
        message: `${s.key} is not anchored to an action or cut; it will be displaced when its shot is re-timed`,
        repair: { kind: "reanchor", eventId: s.key, anchorKey: "the action it accompanies" } });
    }
  }
  for (const a of input.audio.filter((x) => x.stem === "sfx" && !(x.eventKey && anchored.has(x.eventKey)))) {
    issues.push({ check: "sfx_cue", severity: "warning", eventId: a.key, atUs: a.startUs, measured: {}, expected: {}, confidence: 1,
      message: `${a.key} (sound effect) is placed without an anchor`, repair: { kind: "reanchor", eventId: a.key, anchorKey: "the action it accompanies" } });
  }
  return issues;
}
