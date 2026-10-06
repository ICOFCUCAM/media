/**
 * AudioVideoDurationValidator (docs/38 §AU.7): measured media against the
 * slots the timeline gives them.
 *
 *  - every shot has placed video (missing_media)
 *  - placed video lasts what its shot lasts, within policy.durationUs, with a
 *    safe repair proposed when one exists (duration)
 *  - placed dialogue / narration audio lasts what its event says (duration)
 *  - speech that runs past the end of its scene's picture is a timeline
 *    mismatch (§AW.11 test 1 in engine terms): never cut — the repair is to
 *    extend or regenerate picture with the approved dialogue timing
 *  - leading / trailing silence in speech beyond the dialogue tolerance (silence)
 */
import type { Us } from "../clock/time";
import { chooseRepair } from "../runtime/outcome";
import { secs, severityFor, type MediaFacts, type RepairAction, type SyncInput, type SyncIssue } from "./types";

const abs = (x: Us) => (x < 0n ? -x : x);

export function validateDurations(input: SyncInput): SyncIssue[] {
  const issues: SyncIssue[] = [];
  const media = new Map<string, MediaFacts>();
  for (const m of input.media) media.set(`${m.kind}:${m.eventKey}`, m);
  const tol = input.policy.tolerances;

  for (const shot of input.events.filter((e) => e.kind === "shot")) {
    const shotId = shot.refId ?? shot.key;
    const span = shot.endUs - shot.startUs;
    const v = media.get(`video:${shot.key}`);
    if (!v || v.durationUs === undefined) {
      issues.push({ check: "missing_media", severity: "blocker", shotId, eventId: shot.key, atUs: shot.startUs, spanUs: span,
        measured: {}, expected: { durationUs: Number(span) }, confidence: 1,
        message: `${shot.key} has no measured video placed on it`,
        repair: { kind: "regenerate_shot", shotId, durationUs: span, reason: "missing media" } });
      continue;
    }
    const delta = v.durationUs - span;
    const sev = severityFor(delta, tol.durationUs);
    if (sev) {
      const t = chooseRepair(delta, Number(v.durationUs) / Number(span), { durationUs: span, trimHandleUs: input.policy.repair.maxTrimUs }, input.policy);
      const repair: RepairAction = !t
        ? { kind: "regenerate_shot", shotId, durationUs: span, reason: `clip is ${secs(abs(delta))} ${delta > 0n ? "long" : "short"}` }
        : t.kind === "trim_tail" ? { kind: "trim_tail", shotId, removeUs: t.removeUs }
        : t.kind === "retime" ? { kind: "retime_clip", shotId, ratio: t.ratio, toDurationUs: t.toDurationUs }
        : { kind: "hold_last_frame", shotId, addUs: t.addUs };
      issues.push({ check: "duration", severity: sev, shotId, eventId: shot.key, atUs: shot.startUs, spanUs: abs(delta),
        measured: { durationUs: Number(v.durationUs) }, expected: { durationUs: Number(span) }, confidence: 1,
        message: `${shot.key}: clip is ${secs(v.durationUs)} for a ${secs(span)} shot (${delta > 0n ? "+" : ""}${secs(delta)})`, repair });
    }
  }

  const scenes = new Map(input.events.filter((e) => e.kind === "scene").map((s) => [s.key, s]));
  for (const line of input.events.filter((e) => e.kind === "dialogue" || e.kind === "narration")) {
    const a = media.get(`audio:${line.key}`);
    const placed = line.endUs - line.startUs;
    if (a?.durationUs !== undefined) {
      const sev = severityFor(a.durationUs - placed, tol.dialogueEndUs);
      if (sev) {
        issues.push({ check: "duration", severity: sev, eventId: line.key, atUs: line.startUs, spanUs: abs(a.durationUs - placed),
          measured: { durationUs: Number(a.durationUs) }, expected: { durationUs: Number(placed) }, confidence: 1,
          message: `${line.key}: audio is ${secs(a.durationUs)}, the timeline places ${secs(placed)}`,
          repair: { kind: "human_review", reason: "re-place the line with its measured duration" } });
      }
      for (const [edge, us] of [["leading", a.leadingUs], ["trailing", a.trailingUs]] as const) {
        if (us !== undefined && severityFor(us, tol.dialogueStartUs)) {
          issues.push({ check: "silence", severity: "warning", eventId: line.key, atUs: edge === "leading" ? line.startUs : line.endUs - us, spanUs: us,
            measured: { silenceUs: Number(us) }, expected: { maxSilenceUs: Number(tol.dialogueStartUs) }, confidence: 0.9,
            message: `${line.key}: ${secs(us)} of ${edge} silence shifts the audible line` });
        }
      }
    }
    const scene = line.parentKey ? scenes.get(line.parentKey) : undefined;
    const end = a?.durationUs !== undefined ? line.startUs + a.durationUs : line.endUs;
    if (scene && end > scene.endUs + tol.dialogueEndUs) {
      const over = end - scene.endUs;
      const lastShot = input.events.filter((e) => e.kind === "shot" && e.parentKey === scene.key).sort((x, y) => (x.endUs < y.endUs ? 1 : -1))[0];
      const shotId = lastShot?.refId ?? lastShot?.key ?? scene.key;
      issues.push({ check: "duration", severity: over > input.policy.repair.maxHoldUs ? "blocker" : "error", sceneId: scene.refId, eventId: line.key,
        atUs: scene.endUs, spanUs: over, measured: { overrunUs: Number(over) }, expected: { overrunUs: 0 }, confidence: 1,
        message: `${line.key} runs ${secs(over)} past the end of ${scene.key}'s picture — speech is never cut`,
        repair: over <= input.policy.repair.maxHoldUs
          ? { kind: "hold_last_frame", shotId, addUs: over }
          : { kind: "regenerate_tail", shotId, fromUs: lastShot ? lastShot.startUs : scene.startUs, durationUs: (lastShot ? lastShot.endUs - lastShot.startUs : 0n) + over, constraint: "approved_dialogue_timing" } });
    }
  }
  return issues;
}
