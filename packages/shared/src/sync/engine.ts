/**
 * AVSyncEngine (docs/38 §AU.7): runs the synchronization checks over one
 * timeline version and its measured media, and returns the report plus the
 * RepairPlanner's plan. A report passes only with no error or blocker.
 *
 * Analysis only. It changes no media and no timeline; the outcome is data for
 * the repair engine (Phase 9) and the Final Quality Gate (Phase 10).
 */
import { alignDialogue } from "./dialogue-aligner";
import { validateDurations } from "./duration-validator";
import { validateCues } from "./cue-validators";
import { validateLoudness } from "./loudness";
import { validatePicture } from "./picture-validator";
import { policyRef } from "./policy";
import { detectDrift, validateFrameRates } from "./rate-and-drift";
import { planRepairs, type RepairPlan } from "./repair-planner";
import { validateSubtitles } from "./subtitle-sync";
import { analyzeTimeline } from "./timeline-analyzer";
import type { AVSyncReport, SyncCheck, SyncInput, SyncIssue } from "./types";

export const ENGINE_VERSION = "cineforge.avsync@1";

/** Provenance (§AW.10): every placed media version is identified and traceable. */
export function validateProvenance(input: SyncInput): SyncIssue[] {
  const events = new Map(input.events.map((e) => [e.key, e]));
  return input.media
    .filter((m) => m.eventKey !== "program" && (!m.sha256 || !m.generationRef))
    .map((m) => ({
      check: "provenance" as const,
      severity: "error" as const,
      eventId: m.eventKey,
      atUs: events.get(m.eventKey)?.startUs ?? 0n,
      measured: { hasChecksum: m.sha256 ? 1 : 0, hasGeneration: m.generationRef ? 1 : 0 },
      expected: { hasChecksum: 1, hasGeneration: 1 },
      confidence: 1,
      message: `${m.eventKey}: placed media has no ${[!m.sha256 && "checksum", !m.generationRef && "generation record"].filter(Boolean).join(" or ")}`,
      repair: { kind: "human_review" as const, reason: "untraceable media cannot be mastered" },
    }));
}

const RUNNERS: Array<[SyncCheck[], (i: SyncInput) => SyncIssue[]]> = [
  [["transitions", "frame_rate", "duration", "dialogue_alignment", "music_cue", "sfx_cue", "subtitle"], analyzeTimeline],
  [["duration", "missing_media", "silence"], validateDurations],
  [["dialogue_alignment"], alignDialogue],
  [["subtitle"], validateSubtitles],
  [["frame_rate"], validateFrameRates],
  [["drift"], detectDrift],
  [["music_cue", "sfx_cue"], validateCues],
  [["loudness", "clipping"], validateLoudness],
  [["black_frames", "dropped_frames"], validatePicture],
  [["provenance"], validateProvenance],
];

export const ENGINE_CHECKS: SyncCheck[] = [...new Set(RUNNERS.flatMap(([c]) => c))];

export function analyzeSync(
  input: SyncInput,
  opts: { checks?: SyncCheck[]; attemptsByShot?: Record<string, number>; toolVersions?: Record<string, string> } = {},
): { report: AVSyncReport; plan: RepairPlan } {
  const wanted = new Set(opts.checks ?? ENGINE_CHECKS);
  const issues = RUNNERS
    .filter(([checks]) => checks.some((c) => wanted.has(c)))
    .flatMap(([, run]) => run(input))
    .filter((i) => wanted.has(i.check));
  // The same finding from two components is reported once.
  const seen = new Set<string>();
  const unique = issues.filter((i) => {
    const k = `${i.check}|${i.eventId ?? ""}|${i.atUs}|${i.message}`;
    return seen.has(k) ? false : (seen.add(k), true);
  });
  unique.sort((a, b) => (a.atUs === b.atUs ? 0 : a.atUs < b.atUs ? -1 : 1));
  const plan = planRepairs(unique, input.policy, opts.attemptsByShot);
  for (const [n, r] of plan.repairs.entries()) for (const i of r.issues) unique[i]!.repair = plan.repairs[n]!.action;
  return {
    report: {
      timelineVersionId: input.timelineVersionId,
      policy: policyRef(input.policy),
      checks: [...wanted],
      passed: !unique.some((i) => i.severity === "error" || i.severity === "blocker"),
      issues: unique,
      toolVersions: { engine: ENGINE_VERSION, ...(opts.toolVersions ?? {}) },
    },
    plan,
  };
}
