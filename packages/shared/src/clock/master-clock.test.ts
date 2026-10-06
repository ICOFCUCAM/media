import { describe, expect, it } from "vitest";
import { ClockError, FPS, MasterClock } from "./index";

describe("MasterClock", () => {
  const clock = new MasterClock({ fps: "24000/1001" });

  it("binds one production rate and sample rate", () => {
    expect(clock.id).toBe("24000/1001@48000");
    expect(() => new MasterClock({ fps: "16" })).toThrow(ClockError);
    expect(new MasterClock({ fps: "16", allowNonStandardRate: true }).fps).toEqual({ num: 16, den: 1 });
    expect(() => new MasterClock({ fps: FPS.FILM_24, sampleRate: 0 })).toThrow(ClockError);
  });

  it("applies the snap rules per event class", () => {
    const c24 = new MasterClock({ fps: FPS.FILM_24 });
    expect(c24.snapPicture(50_000n)).toBe(41_666n);
    expect(c24.snapSubtitle(50_000n)).toBe(41_666n);
    expect(c24.snapAudio(50_009n)).toBe(50_000n);
    expect(c24.snapAudio(50_011n)).toBe(50_020n);
    expect(c24.snapAudio(50_001n, "ceil")).toBe(50_020n);
    expect(c24.shotDurationUs(6.84)).toBe(6_833_333n);
    expect(c24.frames(0n, 6_840_000n)).toBe(164n);
    expect(c24.timecode(c24.frameStart(24 * 60))).toBe("00:01:00:00");
  });

  it("conforms model-native clips once, into its own rate", () => {
    const plan = clock.conform("16", 81);
    expect(plan.target.fps).toEqual(FPS.FILM_23_976);
    expect(plan.method).toBe("duplicate");
    expect(plan.target.frameCount).toBe(122n);
  });
});
