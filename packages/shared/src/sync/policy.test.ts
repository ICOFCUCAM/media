import { describe, expect, it } from "vitest";
import { DEFAULT_SYNC_POLICIES, PRODUCTION_PROFILES, policyRef, syncPolicy, syncPolicyFromJson, syncPolicyToJson } from "./policy";

describe("sync policies", () => {
  it("defines every production profile, uncalibrated, version 1", () => {
    for (const id of PRODUCTION_PROFILES) {
      const p = syncPolicy(id);
      expect(p.calibrated).toBe(false);
      expect(policyRef(p)).toBe(`${id}@1`);
      expect(p.tolerances.lipSyncLeadUs).toBeLessThanOrEqual(p.tolerances.lipSyncLagUs);
    }
    expect(() => syncPolicy("vlog")).toThrow();
  });

  it("broadcast is stricter than social", () => {
    const b = DEFAULT_SYNC_POLICIES.broadcast;
    const s = DEFAULT_SYNC_POLICIES.social;
    expect(b.tolerances.durationUs).toBeLessThan(s.tolerances.durationUs);
    expect(b.delivery.integratedLufs).toBe(-23);
    expect(b.repair.maxRetimeRatio).toBeLessThan(s.repair.maxRetimeRatio);
  });

  it("round-trips through the table's JSON form", () => {
    const p = syncPolicy("documentary");
    const json = syncPolicyToJson(p) as Parameters<typeof syncPolicyFromJson>[0];
    expect(typeof json.tolerances.durationUs).toBe("number");
    expect(syncPolicyFromJson(json)).toEqual(p);
    const tuned = syncPolicyFromJson({ ...json, version: 2, tolerances: { ...json.tolerances, durationUs: 10_000 } });
    expect(tuned.tolerances.durationUs).toBe(10_000n);
    expect(policyRef(tuned)).toBe("documentary@2");
  });
});
