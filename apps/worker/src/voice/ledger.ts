/**
 * The speech ledger (DirectorOS Part 4 §149; W15): every spoken part of a
 * film — a narration or one line — is one audio_generations row with its
 * place on the Master Clock (the scene's planned start plus the cue's start in
 * the scene track), the voice and engine that spoke it, and how many segments
 * it took. A film's narration is never one opaque request.
 */
import type { SpokenCue } from "./film";

export interface LedgerRow {
  projectId: string;
  kind: "dialogue" | "narration";
  dialogueLineId: string | null;
  language: string;
  voiceId: string;
  provider: string;
  modelId: string;
  requestedStartUs: bigint;
  requestedEndUs: bigint;
  meta: Record<string, unknown>;
  outcome: "ACCEPTED";
  outcomeCode: "SPOKEN";
  policy: "voice-engine";
  classifiedAt: Date;
}

export function speechLedgerRows(
  a: { projectId: string; sceneId: string; sceneStartSec: number; language: string; trackKey: string; attempt?: number },
  cues: SpokenCue[],
  now = new Date(),
): LedgerRow[] {
  const sceneUs = BigInt(Math.round(a.sceneStartSec * 1e6));
  return cues
    .filter((c) => c.durationMs > 0)
    .map((c) => ({
      projectId: a.projectId,
      kind: c.lineId ? "dialogue" : "narration",
      dialogueLineId: c.lineId,
      language: a.language,
      // A cloned voice by its CineForge id; a built-in voice by its preset — never a provider's id.
      voiceId: c.voiceId ?? `builtin:${c.preset ?? "default"}`,
      provider: c.engine,
      modelId: c.engineVersion,
      requestedStartUs: sceneUs + BigInt(c.startMs) * 1000n,
      requestedEndUs: sceneUs + BigInt(c.startMs + c.durationMs) * 1000n,
      meta: { sceneId: a.sceneId, characterId: c.characterId, voice: c.voice, segments: c.segments, trackKey: a.trackKey, audioKey: c.audioKey },
      outcome: "ACCEPTED" as const,
      outcomeCode: "SPOKEN" as const,
      policy: "voice-engine" as const,
      classifiedAt: now,
    }));
}
