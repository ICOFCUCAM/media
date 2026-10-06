/**
 * docs/38 §AW.11 regression test 7 — runtime duration mismatch.
 * Input: requested 6.840 s, produced 5.800 s.
 * Expected: actual_duration recorded, timing_accuracy calculated, outcome
 * REQUIRES_REPAIR / REQUIRES_REGENERATION / FAILED.
 * Must not happen: success.
 *
 * The wire report is exactly what apps/gpu-worker/app/timing.py emits for a
 * 145-frame 25 fps clip (tests/test_timing.py::test_regression_7_real_clip
 * measures a real file of that shape).
 */
import { describe, expect, it } from "vitest";
import { FPS } from "../clock/rational";
import { PRODUCTION_PROFILES, syncPolicy } from "../sync/policy";
import { classifyVideoResult } from "./outcome";

const REPORT = {
  kind: "video",
  requestedDurationUs: 6_840_000,
  actualDurationUs: 5_800_000,
  containerDurationUs: 5_800_000,
  timingAccuracy: { deltaUs: -1_040_000, ratio: 0.847953 },
  frameRate: { num: 25, den: 1 },
  timebase: { num: 1, den: 12800 },
  frameCount: 145,
  requestedFrameRate: { num: 25, den: 1 },
  conformApplied: "none",
  measuredBy: "ffprobe",
};

describe("regression test 7: requested 6.840 s, produced 5.800 s", () => {
  it("records actual duration and timing accuracy", () => {
    const d = classifyVideoResult({ timing: REPORT, request: { durationUs: 6_840_000n, fps: FPS.PAL_25 }, policy: syncPolicy("cinematic") });
    expect(d.requestedDurationUs).toBe(6_840_000n);
    expect(d.actualDurationUs).toBe(5_800_000n);
    expect(d.deltaUs).toBe(-1_040_000n);
    expect(d.ratio).toBeCloseTo(0.848, 3);
    expect(d.outcome).toBe("REQUIRES_REGENERATION");
  });

  it("is never a success, under any profile, attempt or permission", () => {
    for (const profile of PRODUCTION_PROFILES) {
      for (const attempt of [1, 2, 3, 9]) {
        for (const trimHandleUs of [0n, 10_000_000n]) {
          const d = classifyVideoResult({
            timing: REPORT,
            request: { durationUs: 6_840_000n, fps: FPS.PAL_25, trimHandleUs, allowedConform: ["duplicate", "pad"] },
            policy: syncPolicy(profile),
            attempt,
          });
          expect(["REQUIRES_REPAIR", "REQUIRES_REGENERATION", "FAILED"]).toContain(d.outcome);
          expect(d.actualDurationUs).toBe(5_800_000n);
        }
      }
    }
  });

  it("the same media with the request echoed as the measurement is rejected", () => {
    const echoed = { ...REPORT, actualDurationUs: 6_840_000, timingAccuracy: { deltaUs: 0, ratio: 1 } };
    const d = classifyVideoResult({ timing: echoed, request: { durationUs: 6_840_000n, fps: FPS.PAL_25 }, policy: syncPolicy("social") });
    expect(d).toMatchObject({ outcome: "FAILED", code: "TIMING_REPORT_INVALID" });
  });
});
