import { describe, expect, it } from "vitest";
import { syncPolicy } from "@cineforge/shared";
import { gateShotTiming, timingPolicyMode, timingSummary } from "./timing-gate";

function wire(requestedUs: number, frames: number, fps = 16) {
  const actual = Math.floor((frames * 1_000_000) / fps);
  return { requestedDurationUs: requestedUs, actualDurationUs: actual, timingAccuracy: { deltaUs: actual - requestedUs, ratio: 0 },
    frameRate: { num: fps, den: 1 }, frameCount: frames, requestedFrameRate: { num: fps, den: 1 }, conformApplied: "none" };
}

const policy = syncPolicy("cinematic");

describe("shot timing gate", () => {
  it("record mode classifies but never blocks — the Wan frame cap becomes visible", () => {
    const g = gateShotTiming({ modelId: "wan-2.1", request: { durationSec: 5 }, result: { timing: wire(5_000_000, 25) }, attempt: 1, mode: "record", policy });
    expect(g.action).toBe("accept");
    expect(timingSummary(g)).toMatchObject({ outcome: "REQUIRES_REGENERATION", actualDurationUs: "1562500", deltaUs: "-3437500", ratio: 0.3125, policy: "cinematic@1" });
  });

  it("enforce mode retries a regeneration and fails an invalid result", () => {
    const regen = gateShotTiming({ modelId: "wan-2.1", request: { durationSec: 5 }, result: { timing: wire(5_000_000, 25) }, attempt: 1, mode: "enforce", policy });
    expect(regen.action).toBe("retry");
    const missing = gateShotTiming({ modelId: "wan-2.1", request: { durationSec: 5 }, result: {}, attempt: 1, mode: "enforce", policy });
    expect(missing).toMatchObject({ action: "fail", decision: { code: "TIMING_REPORT_MISSING" } });
    const ok = gateShotTiming({ modelId: "wan-2.1", request: { durationSec: 5 }, result: { timing: wire(5_000_000, 80) }, attempt: 1, mode: "enforce", policy });
    expect(ok.action).toBe("accept");
    const repair = gateShotTiming({ modelId: "wan-2.1", request: { durationSec: 5 }, result: { timing: wire(5_000_000, 78) }, attempt: 1, mode: "enforce", policy });
    expect(repair).toMatchObject({ action: "accept", decision: { outcome: "REQUIRES_REPAIR" } });
    expect(timingSummary(repair).repair).toMatchObject({ kind: "retime", toDurationUs: "5000000" });
  });

  it("uses the rate the adapter actually sends", () => {
    const h = gateShotTiming({ modelId: "hunyuan", request: { durationSec: 5 }, result: { timing: wire(5_000_000, 120, 24) }, attempt: 1, mode: "enforce", policy });
    expect(h.decision.outcome).toBe("ACCEPTED");
  });

  it("reads the mode strictly", () => {
    expect(timingPolicyMode({})).toBe("record");
    expect(timingPolicyMode({ RUNTIME_TIMING_POLICY: "ENFORCE" })).toBe("enforce");
    expect(() => timingPolicyMode({ RUNTIME_TIMING_POLICY: "off" })).toThrow();
  });
});
