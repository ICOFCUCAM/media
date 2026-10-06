import { beforeEach, describe, expect, it } from "vitest";
import { syncPolicy } from "@cineforge/shared";
import type { ShotRequest } from "@cineforge/model-adapters";
import { _resetLedgerState, recordVideoGeneration, requestSha256, videoGenerationRow } from "./ledger";
import { gateShotTiming } from "./timing-gate";

const timing = { requestedDurationUs: 5_000_000, actualDurationUs: 1_562_500, timingAccuracy: { deltaUs: -3_437_500, ratio: 0.3125 },
  frameRate: { num: 16, den: 1 }, frameCount: 25, requestedFrameRate: { num: 16, den: 1 }, conformApplied: "none" };
const request: ShotRequest = { prompt: "p", durationSec: 5, width: 832, height: 480, job: { shotId: "s" } as ShotRequest["job"] };
const result = { videoKey: "k", seed: 1, gpuMs: 900, width: 832, height: 480, durationSec: 5, timing };

describe("video generation ledger", () => {
  beforeEach(() => _resetLedgerState());

  it("records the request, the report as received and Cineforge's decision", () => {
    const gate = gateShotTiming({ modelId: "wan-2.1", request, result, attempt: 2, mode: "record", policy: syncPolicy("cinematic") });
    const row = videoGenerationRow({ projectId: "p", shotId: "s", modelId: "wan-2.1", request, result, gate });
    expect(row).toMatchObject({
      attempt: 2, requestedDurationUs: 5_000_000n, requestedFpsNum: 16, requestedFpsDen: 1,
      actualDurationUs: 1_562_500n, outcome: "REQUIRES_REGENERATION", outcomeCode: "DURATION_OUT_OF_TOLERANCE", policy: "cinematic@1",
      timingReport: timing, gpuMs: 900,
    });
    expect(row.graphSha256).toBe(requestSha256(request));
    // The job context is not part of the payload hash.
    expect(requestSha256({ ...request, job: undefined })).toBe(row.graphSha256);
  });

  it("never breaks production: missing table switches it off, other errors are logged", async () => {
    let calls = 0;
    const missing = { videoGeneration: { create: async () => { calls++; throw Object.assign(new Error("x"), { code: "P2021" }); } } };
    expect(await recordVideoGeneration(missing, {})).toBe("skipped");
    expect(await recordVideoGeneration(missing, {})).toBe("skipped");
    expect(calls).toBe(1);
    _resetLedgerState();
    const broken = { videoGeneration: { create: async () => { throw new Error("connection reset"); } } };
    expect(await recordVideoGeneration(broken, {})).toBe("error");
    const ok = { videoGeneration: { create: async () => ({}) } };
    expect(await recordVideoGeneration(ok, {})).toBe("recorded");
  });
});
