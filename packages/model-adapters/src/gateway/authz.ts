/**
 * Workflow + model authorization digest (docs/38 §AV.3).
 *
 * Version 2 (current): every LoRA is bound by storage key AND content hash —
 * model → revision → artifact → content hash → approved manifest → token.
 * Version 1 bound LoRAs by key only; it is still produced for deployments whose
 * approved manifest reports authzVersion 1, and such deployments may not run
 * LoRAs under enforcement (docs/39 §9.1).
 *
 * Must produce byte-identical canonical JSON to
 * apps/gpu-worker/app/gateway/authz.py — locked by the shared golden vector in
 * the tests of both languages. Integers only: durations are whole microseconds
 * (rounded half-to-even, like Python's round()).
 */
import { sha256Hex } from "./token";

export const AUTHZ_VERSION = 2;
export type AuthzVersion = 1 | 2;

export interface AuthzModel {
  role: string;
  id: string;
  revision: string;
  weights: string;
}

export interface AuthzTiming {
  durationUs: number;
  fps: number;
  width: number;
  height: number;
}

export interface AuthzLora {
  key: string;
  sha256: string;
}

export interface AuthzInput {
  /** Defaults to the current version (2). */
  version?: AuthzVersion;
  workflow: string;
  runtime: string;
  models: AuthzModel[];
  /** v2: `{key, sha256}`; v1: keys (a v2 entry's key is used). */
  loras: (AuthzLora | string)[];
  timing: AuthzTiming;
}

/** Python-compatible round(): ties go to the even neighbour. */
export function roundHalfEven(x: number): number {
  const f = Math.floor(x);
  const d = x - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

export function secondsToMicros(sec: number): number {
  return roundHalfEven(sec * 1_000_000);
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.keys(v as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]),
    );
  }
  return v;
}

/** JSON with sorted keys, no whitespace, non-ASCII escaped (= Python ensure_ascii). */
export function canonicalJson(doc: unknown): string {
  return JSON.stringify(sortKeys(doc)).replace(/[\u0080-￿]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
}

export function authzDocument(input: AuthzInput) {
  for (const n of [input.timing.durationUs, input.timing.fps, input.timing.width, input.timing.height]) {
    if (!Number.isInteger(n)) throw new Error("authz timing values must be integers");
  }
  const version = input.version ?? AUTHZ_VERSION;
  const loras =
    version === 1
      ? [...new Set(input.loras.map((l) => (typeof l === "string" ? l : l.key)))].sort()
      : [...new Map(input.loras.map((l) => {
          if (typeof l === "string") throw new Error("authz v2 needs a content hash for every LoRA");
          return [l.key, l.sha256] as const;
        })).entries()]
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([key, sha256]) => ({ key, sha256 }));
  return {
    v: version,
    workflow: input.workflow,
    runtime: input.runtime,
    models: [...input.models]
      .map((m) => ({ role: m.role, id: m.id, revision: m.revision, weights: m.weights }))
      .sort((a, b) => (a.role < b.role ? -1 : a.role > b.role ? 1 : 0)),
    loras,
    timing: {
      durationUs: input.timing.durationUs,
      fps: input.timing.fps,
      width: input.timing.width,
      height: input.timing.height,
    },
  };
}

export function authzDigest(input: AuthzInput): string {
  return sha256Hex(canonicalJson(authzDocument(input)));
}
