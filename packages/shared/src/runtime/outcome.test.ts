import { describe, expect, it } from "vitest";
import { FPS } from "../clock/rational";
import { syncPolicy } from "../sync/policy";
import { classifyVideoResult } from "./outcome";

const WAN = { num: 16, den: 1 };
const cinematic = syncPolicy("cinematic");

function wire(requestedUs: number, frames: number, fps = WAN, extra: Record<string, unknown> = {}) {
  const actual = Math.floor((frames * 1_000_000 * fps.den) / fps.num);
  return {
    kind: "video",
    requestedDurationUs: requestedUs,
    actualDurationUs: actual,
    timingAccuracy: { deltaUs: actual - requestedUs, ratio: actual / requestedUs },
    frameRate: fps,
    frameCount: frames,
    requestedFrameRate: WAN,
    conformApplied: "none",
    ...extra,
  };
}

const req = (durationUs: bigint, more = {}) => ({ durationUs, fps: WAN, ...more });

describe("runtime outcome classification", () => {
  it("accepts a result within the duration tolerance", () => {
    const d = classifyVideoResult({ timing: wire(5_000_000, 80), request: req(5_000_000n), policy: cinematic });
    expect(d).toMatchObject({ outcome: "ACCEPTED", code: "WITHIN_TOLERANCE", deltaUs: 0n, policy: "cinematic@1" });
  });

  it("docs example shape: 6.840 s requested, a little short → REQUIRES_REPAIR (retime)", () => {
    // At 16 fps the nearest clips are 6.8125 s (109 frames, −27.5 ms: inside the
    // cinematic ±42 ms) and 6.75 s (108 frames, −90 ms, −1.3 %: retime).
    expect(classifyVideoResult({ timing: wire(6_840_000, 109), request: req(6_840_000n), policy: cinematic }).outcome).toBe("ACCEPTED");
    const d = classifyVideoResult({ timing: wire(6_840_000, 108), request: req(6_840_000n), policy: cinematic });
    expect(d.outcome).toBe("REQUIRES_REPAIR");
    expect(d.repair).toMatchObject({ kind: "retime", toDurationUs: 6_840_000n });
    expect(d).toMatchObject({ requestedDurationUs: 6_840_000n, actualDurationUs: 6_750_000n, deltaUs: -90_000n });
  });

  it("trims a too-long clip only from handles the plan allows", () => {
    const long = wire(5_000_000, 84); // 5.25 s
    expect(classifyVideoResult({ timing: long, request: req(5_000_000n, { trimHandleUs: 500_000n }), policy: cinematic }).repair)
      .toEqual({ kind: "trim_tail", removeUs: 250_000n });
    // No handles → retime is not possible either (5 % > 4 %) → regenerate.
    expect(classifyVideoResult({ timing: long, request: req(5_000_000n), policy: cinematic }).outcome).toBe("REQUIRES_REGENERATION");
  });

  it("holds the last frame only for a brief shortfall the retime limit cannot cover", () => {
    const d = classifyVideoResult({ timing: wire(5_000_000, 74), request: req(5_000_000n), policy: cinematic }); // 4.625 s
    expect(d.repair).toEqual({ kind: "hold_last_frame", addUs: 375_000n });
  });

  it("an invalid result is FAILED, whatever media exists", () => {
    expect(classifyVideoResult({ timing: null, request: req(5_000_000n), policy: cinematic })).toMatchObject({ outcome: "FAILED", code: "TIMING_REPORT_MISSING" });
    expect(classifyVideoResult({ timing: { nope: 1 }, request: req(5_000_000n), policy: cinematic })).toMatchObject({ outcome: "FAILED", code: "TIMING_REPORT_INVALID" });
    expect(classifyVideoResult({ timing: wire(4_000_000, 64), request: req(5_000_000n), policy: cinematic })).toMatchObject({ outcome: "FAILED", code: "TIMING_REPORT_MISMATCH" });
    const at24 = wire(5_000_000, 120, FPS.FILM_24);
    expect(classifyVideoResult({ timing: at24, request: req(5_000_000n), policy: cinematic })).toMatchObject({ outcome: "FAILED", code: "FRAME_RATE_MISMATCH" });
    const padded = wire(5_000_000, 80, WAN, { conformApplied: "pad" });
    expect(classifyVideoResult({ timing: padded, request: req(5_000_000n), policy: cinematic })).toMatchObject({ outcome: "FAILED", code: "UNPERMITTED_CONFORM" });
    expect(classifyVideoResult({ timing: padded, request: req(5_000_000n, { allowedConform: ["pad"] }), policy: cinematic }).outcome).toBe("ACCEPTED");
  });

  it("is FAILED once the repair budget is spent", () => {
    const d = classifyVideoResult({ timing: wire(6_840_000, 108), request: req(6_840_000n), policy: cinematic, attempt: 3 });
    expect(d).toMatchObject({ outcome: "FAILED", code: "REPAIR_BUDGET_EXHAUSTED" });
  });

  it("depends on the production profile", () => {
    // 6.75 s for 6.84 s (−90 ms): within social's ±125 ms, outside broadcast's ±40 ms.
    const t = wire(6_840_000, 108);
    expect(classifyVideoResult({ timing: t, request: req(6_840_000n), policy: syncPolicy("social") }).outcome).toBe("ACCEPTED");
    expect(classifyVideoResult({ timing: t, request: req(6_840_000n), policy: syncPolicy("broadcast") }).outcome).toBe("REQUIRES_REPAIR");
  });
});
