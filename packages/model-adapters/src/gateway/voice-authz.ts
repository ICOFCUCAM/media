/**
 * Voice workflow + model authorization digest (docs/74; docs/38 §AV.3).
 *
 * The voice counterpart of the video `authz` claim: engine, operation, runtime,
 * every model (checkpoint id, pinned revision, weights digest) from the
 * deployment's APPROVED manifest, and every input object by storage key AND
 * content hash (reference recording, stored voice artifact). The GPU voice
 * service (apps/gpu-voice/app/voice_authz.py) recomputes it from what it would
 * actually run; any difference is AUTHZ_MISMATCH.
 *
 * Byte-identical canonical JSON in both languages — locked by the golden vector
 * in apps/gpu-voice/tests/fixtures/voice_crosslang.json.
 */
import { canonicalJson, type AuthzModel } from "./authz";
import { sha256Hex } from "./token";

export const VOICE_AUTHZ_VERSION = 1;
export type VoiceOperation = "enroll" | "speak" | "score";

export interface VoiceAuthzInput {
  engine: string;
  operation: VoiceOperation;
  runtime: string;
  models: AuthzModel[];
  inputs: { key: string; sha256: string }[];
}

export function voiceAuthzDocument(input: VoiceAuthzInput) {
  const byKey = new Map(input.inputs.map((i) => [i.key, i.sha256] as const));
  return {
    v: VOICE_AUTHZ_VERSION,
    kind: "voice",
    workflow: `voice.${input.engine}.${input.operation}@1`,
    runtime: input.runtime,
    models: [...input.models]
      .map((m) => ({ role: m.role, id: m.id, revision: m.revision, weights: m.weights }))
      .sort((a, b) => (a.role < b.role ? -1 : a.role > b.role ? 1 : 0)),
    inputs: [...byKey.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([key, sha256]) => ({ key, sha256 })),
  };
}

export function voiceAuthzDigest(input: VoiceAuthzInput): string {
  return sha256Hex(canonicalJson(voiceAuthzDocument(input)));
}
