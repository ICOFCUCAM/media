import { describe, expect, it } from "vitest";
import { conformRecord, planConform, sourceFrameFor } from "./conform";
import { FPS } from "./rational";
import { ClockError, frameToUs } from "./time";

const WAN = { num: 16, den: 1 };

// docs/38 §AW.11 regression test 2 — frame-rate mismatch.
describe("regression test 2: 16 fps source into a 24 fps production", () => {
  it("is a controlled conversion with exact durations", () => {
    const plan = planConform(WAN, 96, FPS.FILM_24);
    expect(plan.method).toBe("duplicate");
    expect(plan.source.durationUs).toBe(6_000_000n);
    expect(plan.target.frameCount).toBe(144n);
    expect(plan.target.durationUs).toBe(6_000_000n);
    expect(plan.padUs).toBe(0n);
    expect(plan.ffmpegFilter).toBe("fps=fps=24/1:round=down");
  });

  it("maps every 2 source frames to 3 target frames, in order", () => {
    const plan = planConform(WAN, 96, FPS.FILM_24);
    const map = Array.from({ length: 6 }, (_, i) => Number(sourceFrameFor(plan, i)));
    expect(map).toEqual([0, 0, 1, 2, 2, 3]);
    expect(sourceFrameFor(plan, 143)).toBe(95n);
  });

  it("is recorded as a media-version derivative", () => {
    expect(conformRecord(planConform(WAN, 81, FPS.FILM_24))).toEqual({
      kind: "conform",
      method: "duplicate",
      sourceFps: "16/1",
      targetFps: "24/1",
      sourceFrames: "81",
      targetFrames: "122",
      sourceDurationUs: "5062500",
      targetDurationUs: "5083333",
      padUs: "20833",
      filter: "fps=fps=24/1:round=down",
    });
  });

  it("does not drift over an hour, including into 23.976", () => {
    for (const target of [FPS.FILM_24, FPS.FILM_23_976, FPS.PAL_25, FPS.NTSC_29_97]) {
      const plan = planConform(WAN, 16 * 3600, target);
      // The conformed clip ends within one target frame of the source.
      const frame = frameToUs(1, target);
      expect(plan.target.durationUs - plan.source.durationUs).toBeGreaterThanOrEqual(-1n);
      expect(plan.target.durationUs - plan.source.durationUs).toBeLessThanOrEqual(frame + 1n);
      // Every sampled target frame shows a source frame that started at most one source frame earlier.
      for (let i = 0n; i < plan.target.frameCount; i += 7_777n) {
        const shown = sourceFrameFor(plan, i);
        const lag = frameToUs(i, target) - frameToUs(shown, WAN);
        expect(lag).toBeGreaterThanOrEqual(-1n);
        expect(lag).toBeLessThan(62_501n);
      }
    }
  });

  it("is a no-op at the production rate and rejects empty clips", () => {
    const plan = planConform(FPS.FILM_24, 48, { num: 48, den: 2 });
    expect(plan.method).toBe("none");
    expect(plan.ffmpegFilter).toBeNull();
    expect(() => planConform(WAN, 0, FPS.FILM_24)).toThrow(ClockError);
    expect(planConform(WAN, 96, FPS.FILM_24, "interpolate").ffmpegFilter).toMatch(/^minterpolate=fps=24\/1/);
  });
});
