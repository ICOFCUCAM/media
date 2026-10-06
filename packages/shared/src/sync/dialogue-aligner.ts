/**
 * DialogueAligner (docs/38 §AU.7, §AU.8, §AU.9; §AW.11 regression test 4).
 *
 * Dialogue timing is authoritative (audio-first, §AU.5): when speech and
 * picture disagree, the picture is repaired — the approved dialogue never
 * moves to fit a clip.
 *
 * Levels checked:
 *   scene     the line lies inside its scene
 *   shot      the line begins and ends inside the visual segment that should
 *             carry it: the speaking segment of the line's character in that
 *             shot when one is known ('action' events with
 *             payload.speaking = true), otherwise the shot itself
 *   temporal  speech onset vs visible speaking onset, within the policy's
 *             lip-sync lead / lag window (sound early = lead)
 *   character the speaking segment belongs to the line's character
 *
 * Mouth-motion and word/phoneme levels need visual analysis (LipSyncValidator).
 */
import type { Us } from "../clock/time";
import type { DraftEvent } from "../timeline/build";
import { secs, type SyncInput, type SyncIssue } from "./types";

interface Segment {
  startUs: Us;
  endUs: Us;
  characterId: string | null;
  measured: boolean;
}

function speakingSegments(input: SyncInput, shot: DraftEvent): Segment[] {
  return input.events
    .filter((e) => e.kind === "action" && e.payload?.speaking === true && e.startUs < shot.endUs && e.endUs > shot.startUs)
    .map((e) => ({ startUs: e.startUs, endUs: e.endUs, characterId: (e.payload?.characterId as string | undefined) ?? null, measured: e.payload?.source === "analysis" }));
}

export function alignDialogue(input: SyncInput): SyncIssue[] {
  const issues: SyncIssue[] = [];
  const t = input.policy.tolerances;
  const byKey = new Map(input.events.map((e) => [e.key, e]));
  const shots = input.events.filter((e) => e.kind === "shot");

  for (const line of input.events.filter((e) => e.kind === "dialogue")) {
    const scene = line.parentKey ? byKey.get(line.parentKey) : undefined;
    const characterId = (line.payload?.characterId as string | undefined) ?? null;
    if (scene && (line.startUs < scene.startUs || line.startUs >= scene.endUs)) {
      issues.push({ check: "dialogue_alignment", severity: "blocker", eventId: line.key, sceneId: scene.refId, atUs: line.startUs,
        measured: { startUs: Number(line.startUs) }, expected: { sceneStartUs: Number(scene.startUs), sceneEndUs: Number(scene.endUs) }, confidence: 1,
        message: `${line.key} starts outside its scene ${scene.key}`, repair: { kind: "human_review", reason: "dialogue placed in the wrong scene" } });
      continue;
    }
    const shot = (line.anchor ? byKey.get(line.anchor.key) : undefined) ?? shots.find((s) => line.startUs >= s.startUs && line.startUs < s.endUs);
    if (!shot) continue;
    const shotId = shot.refId ?? shot.key;
    const label = `Shot ${shotId}`;

    const segs = speakingSegments(input, shot);
    const own = characterId ? segs.filter((s) => s.characterId === characterId) : segs;
    if (characterId && segs.length && !own.length) {
      issues.push({ check: "dialogue_alignment", severity: "error", shotId, eventId: line.key, atUs: line.startUs, spanUs: line.endUs - line.startUs,
        measured: {}, expected: {}, confidence: segs.some((s) => s.measured) ? 0.8 : 0.5,
        message: `${label}: ${line.key} is spoken by ${characterId}, but only ${[...new Set(segs.map((s) => s.characterId ?? "someone"))].join(", ")} visibly speak(s)`,
        repair: { kind: "human_review", reason: "speaking character does not match the dialogue" } });
      continue;
    }
    const seg: Segment = own.sort((a, b) => Number((a.startUs - line.startUs < 0n ? line.startUs - a.startUs : a.startUs - line.startUs) - (b.startUs - line.startUs < 0n ? line.startUs - b.startUs : b.startUs - line.startUs)))[0]
      ?? { startUs: shot.startUs, endUs: shot.endUs, characterId, measured: false };
    const fromShot = !own.length;

    const parts: string[] = [];
    const measured: Record<string, number> = {};
    const expected: Record<string, number> = { segmentStartUs: Number(seg.startUs), segmentEndUs: Number(seg.endUs) };
    let worst = 0n;

    // Temporal: speech onset vs visible speaking onset (only meaningful for a real speaking segment).
    if (!fromShot) {
      const onset = line.startUs - seg.startUs; // + = sound late (lags picture)
      measured.onsetOffsetUs = Number(onset);
      if (onset > t.lipSyncLagUs || -onset > t.lipSyncLeadUs) {
        parts.push(`dialogue begins ${secs(onset < 0n ? -onset : onset)} ${onset > 0n ? "after" : "before"} the expected speaking motion`);
        worst = onset < 0n ? -onset : onset;
      }
    }
    // Shot level: the line must end inside its segment (handles = dialogue end tolerance).
    const overrun = line.endUs - seg.endUs;
    if (overrun > t.dialogueEndUs) {
      measured.overrunUs = Number(overrun);
      parts.push(`dialogue exceeds the visual ${fromShot ? "shot" : "speaking segment"} by ${secs(overrun)}`);
      if (overrun > worst) worst = overrun;
    }
    const early = seg.startUs - line.startUs;
    if (fromShot && early > t.dialogueStartUs) {
      measured.earlyUs = Number(early);
      parts.push(`dialogue starts ${secs(early)} before the shot`);
      if (early > worst) worst = early;
    }
    if (!parts.length) continue;

    // Repair: regenerate the end of the shot under the approved dialogue timing.
    const fromUs = (line.startUs > shot.startUs ? line.startUs : shot.startUs) - shot.startUs;
    const pastShot = line.endUs - shot.endUs; // the shot itself must grow only if speech outlasts it
    const tailUs = shot.endUs - shot.startUs - fromUs + (pastShot > 0n ? pastShot : 0n);
    const confidence = fromShot ? 0.7 : seg.measured ? 0.9 : 0.75;
    issues.push({
      check: "dialogue_alignment",
      severity: worst > 4n * t.dialogueEndUs ? "blocker" : "error",
      shotId, eventId: line.key, atUs: line.startUs, spanUs: worst, measured, expected, confidence,
      message: `${label}: ${parts.join("; ")}. Recommended repair: regenerate the final ${secs(tailUs)} of the shot using the approved dialogue timing constraint.`,
      repair: { kind: "regenerate_tail", shotId, fromUs, durationUs: tailUs, constraint: "approved_dialogue_timing" },
    });
  }
  return issues;
}
