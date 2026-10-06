/**
 * Synchronization tolerances and production profiles (docs/38 §AW.9). Never
 * hard-coded in a check: every validator and the runtime outcome classifier
 * take a SyncPolicy, and every report records `policy.id@version` so a result
 * stays explainable after calibration changes.
 *
 * The values below are STARTING DEFAULTS, not calibrated gates (§AU.9: "exact
 * values to be confirmed against the standard text and viewer testing").
 * Lip-sync defaults follow the commonly cited broadcast detectability window
 * (sound leading picture by ≤ ~45 ms, lagging by ≤ ~125 ms); loudness targets
 * follow EBU R128 for broadcast and common streaming practice elsewhere.
 * The `sync_policies` table (Phase 4) holds the versions in force.
 */
import type { Us } from "../clock/time";

export const PRODUCTION_PROFILES = ["cinematic", "documentary", "social", "broadcast", "education", "corporate"] as const;
export type ProductionProfile = (typeof PRODUCTION_PROFILES)[number];

export interface SyncTolerances {
  dialogueStartUs: Us;
  dialogueEndUs: Us;
  /** Audio may lead picture by at most this much. */
  lipSyncLeadUs: Us;
  /** Audio may lag picture by at most this much. */
  lipSyncLagUs: Us;
  musicCueUs: Us;
  sfxUs: Us;
  subtitleUs: Us;
  /** |actual − requested| a generated clip may differ by and still be ACCEPTED. */
  durationUs: Us;
  /** Maximum accumulated A/V offset across a scene. */
  driftUs: Us;
  /** ± LU around the delivery loudness target. */
  loudnessLu: number;
}

/** What the repair planner may do without regenerating (§AU.12, §AV.5). */
export interface RepairLimits {
  /** Max speed change of a clip, as a ratio (0.04 = ±4 %). */
  maxRetimeRatio: number;
  /** Max tail a too-long clip may lose (only from handles the plan allows). */
  maxTrimUs: Us;
  /** Max a too-short clip may be extended by holding its last frame. */
  maxHoldUs: Us;
  /** Attempts per shot before the result is FAILED (human review). */
  maxAttempts: number;
}

export interface DeliverySpec {
  integratedLufs: number;
  truePeakDbtp: number;
  sampleRate: number;
  subtitleFormats: Array<"srt" | "vtt">;
}

export interface SyncPolicy {
  id: ProductionProfile | string;
  version: number;
  tolerances: SyncTolerances;
  repair: RepairLimits;
  delivery: DeliverySpec;
  /** False until benchmarked; reports flag results judged by uncalibrated defaults. */
  calibrated: boolean;
}

const ms = (n: number): Us => BigInt(Math.round(n * 1000));

function profile(
  id: ProductionProfile,
  t: { dlg: number; lead: number; lag: number; cue: number; dur: number; drift: number; sub: number },
  delivery: Pick<DeliverySpec, "integratedLufs" | "truePeakDbtp">,
  repair: Partial<{ retime: number; trim: number; hold: number; attempts: number }> = {},
): SyncPolicy {
  return {
    id,
    version: 1,
    calibrated: false,
    tolerances: {
      dialogueStartUs: ms(t.dlg),
      dialogueEndUs: ms(t.dlg),
      lipSyncLeadUs: ms(t.lead),
      lipSyncLagUs: ms(t.lag),
      musicCueUs: ms(t.cue),
      sfxUs: ms(t.cue / 2),
      subtitleUs: ms(t.sub),
      durationUs: ms(t.dur),
      driftUs: ms(t.drift),
      loudnessLu: 1,
    },
    repair: {
      maxRetimeRatio: repair.retime ?? 0.04,
      maxTrimUs: ms(repair.trim ?? 1000),
      maxHoldUs: ms(repair.hold ?? 500),
      maxAttempts: repair.attempts ?? 3,
    },
    delivery: { ...delivery, sampleRate: 48_000, subtitleFormats: ["srt", "vtt"] },
  };
}

/** Starting defaults per profile (milliseconds in, µs stored). */
export const DEFAULT_SYNC_POLICIES: Record<ProductionProfile, SyncPolicy> = {
  cinematic: profile("cinematic", { dlg: 80, lead: 45, lag: 125, cue: 80, dur: 42, drift: 40, sub: 42 }, { integratedLufs: -16, truePeakDbtp: -1 }),
  broadcast: profile("broadcast", { dlg: 60, lead: 40, lag: 60, cue: 80, dur: 40, drift: 40, sub: 40 }, { integratedLufs: -23, truePeakDbtp: -1 }, { retime: 0.02 }),
  documentary: profile("documentary", { dlg: 100, lead: 45, lag: 125, cue: 120, dur: 84, drift: 60, sub: 42 }, { integratedLufs: -16, truePeakDbtp: -1 }),
  education: profile("education", { dlg: 120, lead: 90, lag: 185, cue: 150, dur: 125, drift: 80, sub: 84 }, { integratedLufs: -16, truePeakDbtp: -1 }),
  corporate: profile("corporate", { dlg: 100, lead: 90, lag: 185, cue: 120, dur: 84, drift: 80, sub: 84 }, { integratedLufs: -16, truePeakDbtp: -1 }),
  social: profile("social", { dlg: 120, lead: 90, lag: 185, cue: 150, dur: 125, drift: 100, sub: 84 }, { integratedLufs: -14, truePeakDbtp: -1 }, { retime: 0.06 }),
};

export function syncPolicy(id: string = "cinematic"): SyncPolicy {
  const p = DEFAULT_SYNC_POLICIES[id as ProductionProfile];
  if (!p) throw new Error(`unknown production profile ${JSON.stringify(id)}`);
  return p;
}

/** "cinematic@1" — recorded on every sync report and outcome. */
export function policyRef(p: SyncPolicy): string {
  return `${p.id}@${p.version}`;
}

/** JSON form for the `sync_policies` table (µs as integers). */
export function syncPolicyToJson(p: SyncPolicy): Record<string, unknown> {
  return JSON.parse(JSON.stringify(p, (_k, v) => (typeof v === "bigint" ? Number(v) : v)));
}

/** Read a `sync_policies` row back (tolerances/repair µs fields as integers). */
export function syncPolicyFromJson(row: { id: string; version: number; tolerances: Record<string, number>; repair?: Record<string, number>; delivery: DeliverySpec; calibrated?: boolean }): SyncPolicy {
  const base = DEFAULT_SYNC_POLICIES[row.id as ProductionProfile] ?? DEFAULT_SYNC_POLICIES.cinematic;
  const us = (v: unknown, fallback: Us): Us => (typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? BigInt(v) : fallback);
  const t = row.tolerances ?? {};
  const r = row.repair ?? {};
  return {
    id: row.id,
    version: row.version,
    calibrated: row.calibrated ?? false,
    tolerances: {
      dialogueStartUs: us(t.dialogueStartUs, base.tolerances.dialogueStartUs),
      dialogueEndUs: us(t.dialogueEndUs, base.tolerances.dialogueEndUs),
      lipSyncLeadUs: us(t.lipSyncLeadUs, base.tolerances.lipSyncLeadUs),
      lipSyncLagUs: us(t.lipSyncLagUs, base.tolerances.lipSyncLagUs),
      musicCueUs: us(t.musicCueUs, base.tolerances.musicCueUs),
      sfxUs: us(t.sfxUs, base.tolerances.sfxUs),
      subtitleUs: us(t.subtitleUs, base.tolerances.subtitleUs),
      durationUs: us(t.durationUs, base.tolerances.durationUs),
      driftUs: us(t.driftUs, base.tolerances.driftUs),
      loudnessLu: typeof t.loudnessLu === "number" ? t.loudnessLu : base.tolerances.loudnessLu,
    },
    repair: {
      maxRetimeRatio: typeof r.maxRetimeRatio === "number" ? r.maxRetimeRatio : base.repair.maxRetimeRatio,
      maxTrimUs: us(r.maxTrimUs, base.repair.maxTrimUs),
      maxHoldUs: us(r.maxHoldUs, base.repair.maxHoldUs),
      maxAttempts: typeof r.maxAttempts === "number" ? r.maxAttempts : base.repair.maxAttempts,
    },
    delivery: row.delivery ?? base.delivery,
  };
}
