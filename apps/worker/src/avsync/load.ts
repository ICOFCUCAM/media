/**
 * Load a persisted timeline version (migrations 0028–0029) back into the
 * engine's shapes. Event keys are the row ids; parent and anchor references
 * resolve to those keys.
 */
import { policyRef, syncPolicy, type DraftAudio, type DraftEvent, type SyncPolicy, type Us } from "@cineforge/shared";

export interface TimelineRow {
  id: string;
  projectId: string;
  fpsNum: number;
  fpsDen: number;
  sampleRate: number;
  durationUs: bigint;
  status: string;
  syncPolicyId: string;
  syncPolicyVersion: number;
}

export interface EventRow {
  id: string;
  kind: string;
  startUs: bigint;
  endUs: bigint;
  refType: string | null;
  refId: string | null;
  parentEventId: string | null;
  anchorEventId: string | null;
  anchorOffsetUs: bigint | null;
  anchorMode: string | null;
  payload: unknown;
}

export interface AudioRow {
  id: string;
  timelineEventId: string | null;
  stem: string;
  startUs: bigint;
  endUs: bigint;
  gainDb: unknown;
  fadeInUs: bigint;
  fadeOutUs: bigint;
  audioGenerationId: string | null;
}

export function toDraftEvents(rows: EventRow[]): DraftEvent[] {
  return rows.map((r) => ({
    key: r.id,
    kind: r.kind as DraftEvent["kind"],
    startUs: r.startUs,
    endUs: r.endUs,
    ...(r.refType ? { refType: r.refType } : {}),
    ...(r.refId ? { refId: r.refId } : {}),
    ...(r.parentEventId ? { parentKey: r.parentEventId } : {}),
    ...(r.anchorEventId && r.anchorMode
      ? { anchor: { key: r.anchorEventId, offsetUs: (r.anchorOffsetUs ?? 0n) as Us, mode: r.anchorMode as "start" | "end" | "action" | "cut" } }
      : {}),
    payload: (r.payload ?? {}) as Record<string, unknown>,
  }));
}

export function toDraftAudio(rows: AudioRow[]): DraftAudio[] {
  return rows.map((r) => ({
    key: r.id,
    stem: r.stem as DraftAudio["stem"],
    startUs: r.startUs,
    endUs: r.endUs,
    gainDb: Number(r.gainDb ?? 0),
    fadeInUs: r.fadeInUs,
    fadeOutUs: r.fadeOutUs,
    refType: r.audioGenerationId ? "audio_generation" : "audio_event",
    refId: r.audioGenerationId ?? r.id,
    ...(r.timelineEventId ? { eventKey: r.timelineEventId } : {}),
  }));
}

/** The policy a timeline is judged by: its recorded profile (the version is recorded on the report). */
export function policyFor(t: TimelineRow): { policy: SyncPolicy; note?: string } {
  const policy = syncPolicy(t.syncPolicyId);
  return policy.version === t.syncPolicyVersion
    ? { policy }
    : { policy, note: `timeline asks for ${t.syncPolicyId}@${t.syncPolicyVersion}; judged by ${policyRef(policy)}` };
}
