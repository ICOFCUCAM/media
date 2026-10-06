/**
 * A/V Synchronization Engine vocabulary (docs/38 §AU.7). The engine reads a
 * timeline version and the measured facts about its media, and produces a
 * report of issues — each with a position on the Master Production Clock,
 * what was measured vs expected, a confidence, a human-readable diagnostic
 * and (from the RepairPlanner) a proposed repair. It never edits media and
 * never redefines the timeline.
 */
import type { Us } from "../clock/time";
import type { AudioStem, DraftAudio, DraftEvent, TimelineEventKind } from "../timeline/build";
import type { SyncPolicy } from "./policy";

export type SyncCheck =
  | "duration" | "dialogue_alignment" | "lip_sync" | "music_cue" | "sfx_cue"
  | "subtitle" | "loudness" | "frame_rate" | "drift" | "transitions" | "silence"
  | "clipping" | "black_frames" | "dropped_frames" | "missing_media" | "provenance";

export const SYNC_CHECKS: readonly SyncCheck[] = [
  "duration", "dialogue_alignment", "lip_sync", "music_cue", "sfx_cue", "subtitle", "loudness", "frame_rate",
  "drift", "transitions", "silence", "clipping", "black_frames", "dropped_frames", "missing_media", "provenance",
];

export type Severity = "info" | "warning" | "error" | "blocker";

export type RepairAction =
  /** Regenerate part of a shot with the approved timing as a constraint (§AU.9 example). */
  | { kind: "regenerate_tail"; shotId: string; fromUs: Us; durationUs: Us; constraint: "approved_dialogue_timing" | "approved_duration" }
  | { kind: "regenerate_shot"; shotId: string; durationUs: Us; reason: string }
  | { kind: "retime_clip"; shotId: string; ratio: number; toDurationUs: Us }
  | { kind: "hold_last_frame"; shotId: string; addUs: Us }
  | { kind: "trim_tail"; shotId: string; removeUs: Us }
  | { kind: "shift_audio"; eventId: string; byUs: Us }
  | { kind: "reanchor"; eventId: string; anchorKey: string }
  | { kind: "rebuild_subtitles"; fromDialogue: true }
  | { kind: "normalize_loudness"; targetLufs: number; truePeakDbtp: number }
  | { kind: "conform_frame_rate"; mediaVersionId: string; toFps: string }
  | { kind: "human_review"; reason: string };

export interface SyncIssue {
  check: SyncCheck;
  severity: Severity;
  sceneId?: string;
  shotId?: string;
  eventId?: string;
  atUs: Us;
  spanUs?: Us;
  measured: Record<string, number>;
  expected: Record<string, number>;
  /** 0..1 — low confidence means human review, not automatic repair (§AU.9). */
  confidence: number;
  message: string;
  repair?: RepairAction;
}

export interface AVSyncReport {
  timelineVersionId: string;
  policy: string;
  checks: SyncCheck[];
  passed: boolean;
  issues: SyncIssue[];
  toolVersions: Record<string, string>;
}

/** Facts measured about a placed piece of media (never planned values). */
export interface MediaFacts {
  /** Timeline event the media is placed on (e.g. "shot:<id>"). */
  eventKey: string;
  kind: "video" | "audio";
  mediaVersionId?: string;
  storageKey?: string;
  sha256?: string | null;
  generationRef?: string | null;
  durationUs?: Us;
  frameRate?: { num: number; den: number };
  conformRecorded?: boolean;
  /** Integrated loudness / true peak (audio), from ffmpeg ebur128. */
  loudness?: { integratedLufs: number; truePeakDbtp: number };
  /** Leading / trailing silence (audio) or black (video) in µs. */
  leadingUs?: Us;
  trailingUs?: Us;
  /** Measured A/V offset vs the planned placement (+ = audio late). */
  offsetUs?: Us;
  /** Black-picture intervals inside the clip, relative to its start (blackdetect). */
  blackIntervals?: Array<{ startUs: Us; endUs: Us }>;
  /** Frozen-picture intervals inside the clip, relative to its start (freezedetect). */
  freezeIntervals?: Array<{ startUs: Us; endUs: Us }>;
}

/** The analysis input: one timeline version plus measured media facts. */
export interface SyncInput {
  timelineVersionId: string;
  durationUs: Us;
  fps: { num: number; den: number };
  events: DraftEvent[];
  audio: DraftAudio[];
  media: MediaFacts[];
  policy: SyncPolicy;
}

export type { AudioStem, TimelineEventKind };

/** Map |deviation| / tolerance to a severity: ≤1 ok, ≤2 warning, ≤4 error, else blocker. */
export function severityFor(deviationUs: Us, toleranceUs: Us): Severity | null {
  const d = deviationUs < 0n ? -deviationUs : deviationUs;
  if (d <= toleranceUs) return null;
  if (toleranceUs === 0n) return "error";
  if (d <= 2n * toleranceUs) return "warning";
  if (d <= 4n * toleranceUs) return "error";
  return "blocker";
}

export function issue(i: SyncIssue): SyncIssue {
  return i;
}

/** "6.833s" for diagnostics. */
export function secs(us: Us): string {
  const neg = us < 0n;
  const a = neg ? -us : us;
  const ms = (a + 500n) / 1000n;
  return `${neg ? "-" : ""}${ms / 1000n}.${String(ms % 1000n).padStart(3, "0")}s`;
}
