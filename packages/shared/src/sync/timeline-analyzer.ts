/**
 * TimelineAnalyzer (docs/38 §AU.7, §AU.11): structural checks of one timeline
 * version — the intervals and relationships every other check relies on.
 *
 *  - picture events on frame boundaries (frame_rate)
 *  - events inside the timeline and inside their parent (duration /
 *    dialogue_alignment)
 *  - shots of a scene cut back to back: no gaps, no overlaps (transitions)
 *  - anchored events where their anchor says (music_cue / sfx_cue /
 *    dialogue_alignment): an event whose anchor moved — e.g. a re-timed shot
 *    — is flagged, never silently kept at its old time
 */
import { isFrameAligned, type Us } from "../clock/time";
import type { DraftEvent } from "../timeline/build";
import { secs, severityFor, type SyncCheck, type SyncInput, type SyncIssue } from "./types";

const PICTURE = new Set(["scene", "shot", "subtitle", "transition", "title"]);

function checkFor(kind: DraftEvent["kind"]): SyncCheck {
  if (kind === "dialogue" || kind === "word" || kind === "narration") return "dialogue_alignment";
  if (kind === "music_cue") return "music_cue";
  if (kind === "sfx" || kind === "ambience" || kind === "action") return "sfx_cue";
  if (kind === "subtitle") return "subtitle";
  return "transitions";
}

function toleranceFor(check: SyncCheck, input: SyncInput): Us {
  const t = input.policy.tolerances;
  switch (check) {
    case "dialogue_alignment": return t.dialogueStartUs;
    case "music_cue": return t.musicCueUs;
    case "sfx_cue": return t.sfxUs;
    case "subtitle": return t.subtitleUs;
    default: return 0n;
  }
}

const ref = (e: DraftEvent) => ({
  ...(e.kind === "shot" && e.refId ? { shotId: e.refId } : {}),
  ...(e.kind === "scene" && e.refId ? { sceneId: e.refId } : {}),
  eventId: e.key,
});

export function analyzeTimeline(input: SyncInput): SyncIssue[] {
  const issues: SyncIssue[] = [];
  const byKey = new Map(input.events.map((e) => [e.key, e]));

  for (const e of input.events) {
    if (PICTURE.has(e.kind) && !(isFrameAligned(e.startUs, input.fps) && isFrameAligned(e.endUs, input.fps))) {
      issues.push({ check: "frame_rate", severity: "error", ...ref(e), atUs: e.startUs, spanUs: e.endUs - e.startUs,
        measured: { startUs: Number(e.startUs), endUs: Number(e.endUs) }, expected: { frameAligned: 1 }, confidence: 1,
        message: `${e.kind} ${e.key} is not on frame boundaries at ${input.fps.num}/${input.fps.den}` });
    }
    if (e.endUs > input.durationUs) {
      issues.push({ check: "duration", severity: "blocker", ...ref(e), atUs: input.durationUs, spanUs: e.endUs - input.durationUs,
        measured: { endUs: Number(e.endUs) }, expected: { maxEndUs: Number(input.durationUs) }, confidence: 1,
        message: `${e.key} ends ${secs(e.endUs - input.durationUs)} after the timeline` });
    }
    const parent = e.parentKey ? byKey.get(e.parentKey) : undefined;
    if (e.parentKey && !parent) {
      issues.push({ check: checkFor(e.kind), severity: "error", ...ref(e), atUs: e.startUs, measured: {}, expected: {}, confidence: 1,
        message: `${e.key} belongs to ${e.parentKey}, which is not on this timeline` });
    } else if (parent && (e.startUs < parent.startUs || e.endUs > parent.endUs) && e.kind !== "dialogue") {
      // Dialogue overruns are the DialogueAligner's (it knows speaking segments and handles).
      const over = e.endUs > parent.endUs ? e.endUs - parent.endUs : parent.startUs - e.startUs;
      issues.push({ check: checkFor(e.kind) === "transitions" ? "duration" : checkFor(e.kind), severity: "error", ...ref(e),
        atUs: e.startUs, spanUs: over, measured: { overrunUs: Number(over) }, expected: { overrunUs: 0 }, confidence: 1,
        message: `${e.key} extends ${secs(over)} outside ${parent.key}` });
    }
    if (e.anchor) {
      const a = byKey.get(e.anchor.key);
      const check = checkFor(e.kind);
      if (!a) {
        issues.push({ check, severity: "error", ...ref(e), atUs: e.startUs, measured: {}, expected: {}, confidence: 1,
          message: `${e.key} is anchored to ${e.anchor.key}, which no longer exists`, repair: { kind: "human_review", reason: "anchor removed" } });
        continue;
      }
      const base = e.anchor.mode === "start" || e.anchor.mode === "action" ? a.startUs : a.endUs;
      const expected = base + e.anchor.offsetUs;
      const dev = e.startUs - expected;
      const sev = severityFor(dev, toleranceFor(check, input));
      if (sev) {
        issues.push({ check, severity: sev, ...ref(e), atUs: e.startUs, spanUs: dev < 0n ? -dev : dev,
          measured: { startUs: Number(e.startUs), offsetUs: Number(dev) }, expected: { startUs: Number(expected) }, confidence: 1,
          message: `${e.key} starts ${secs(dev < 0n ? -dev : dev)} ${dev > 0n ? "later" : "earlier"} than its anchor ${a.key} (${e.anchor.mode}${e.anchor.offsetUs ? ` + ${secs(e.anchor.offsetUs)}` : ""}) puts it`,
          repair: { kind: "shift_audio", eventId: e.key, byUs: -dev } });
      }
    }
  }

  // Cuts within a scene: shots back to back.
  const scenes = input.events.filter((e) => e.kind === "scene");
  for (const scene of scenes) {
    const shots = input.events.filter((e) => e.kind === "shot" && e.parentKey === scene.key).sort((x, y) => (x.startUs < y.startUs ? -1 : 1));
    for (let i = 1; i < shots.length; i++) {
      const prev = shots[i - 1]!;
      const cur = shots[i]!;
      if (cur.startUs !== prev.endUs) {
        const gap = cur.startUs - prev.endUs;
        issues.push({ check: "transitions", severity: "error", ...ref(cur), atUs: prev.endUs, spanUs: gap < 0n ? -gap : gap,
          measured: { gapUs: Number(gap) }, expected: { gapUs: 0 }, confidence: 1,
          message: gap > 0n ? `${secs(gap)} of nothing between ${prev.key} and ${cur.key}` : `${cur.key} overlaps ${prev.key} by ${secs(-gap)}` });
      }
    }
  }
  return issues;
}
