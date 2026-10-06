import { describe, expect, it } from "vitest";
import { FPS } from "./rational";
import {
  ClockError,
  frameSpan,
  frameToUs,
  framesDurationUs,
  isFrameAligned,
  msToUs,
  roundDiv,
  sampleToUs,
  secondsToUs,
  snapToFrame,
  usFromJson,
  usToFrame,
  usToSample,
  usToSecondsString,
} from "./time";

describe("frame positions", () => {
  it("frame n starts at floor(n·1e6·den/num)", () => {
    expect(frameToUs(1, FPS.FILM_24)).toBe(41_666n);
    expect(frameToUs(24, FPS.FILM_24)).toBe(1_000_000n);
    expect(frameToUs(1, FPS.FILM_23_976)).toBe(41_708n);
    expect(frameToUs(24_000, FPS.FILM_23_976)).toBe(1_001_000_000n);
  });

  it("usToFrame round-trips frameToUs exactly for every frame of an hour", () => {
    for (const fps of [FPS.FILM_23_976, FPS.FILM_24, FPS.PAL_25, FPS.NTSC_29_97, FPS.NTSC_59_94]) {
      for (let n = 0n; n < 3600n * 60n; n += 997n) {
        const us = frameToUs(n, fps);
        expect(usToFrame(us, fps)).toBe(n);
        expect(usToFrame(us - 1n, fps)).toBe(n - 1n);
        expect(isFrameAligned(us, fps)).toBe(true);
      }
    }
  });

  it("no cumulative drift: frame 24000·k at 23.976 is exactly 1001·k seconds", () => {
    for (const k of [1n, 60n, 3600n]) {
      expect(frameToUs(24_000n * k, FPS.FILM_23_976)).toBe(1_001_000_000n * k);
    }
  });

  it("snaps picture events to frame starts", () => {
    expect(snapToFrame(50_000n, FPS.FILM_24)).toBe(41_666n);
    expect(snapToFrame(70_000n, FPS.FILM_24)).toBe(83_333n);
    expect(snapToFrame(50_000n, FPS.FILM_24, "ceil")).toBe(83_333n);
    expect(snapToFrame(83_333n, FPS.FILM_24, "floor")).toBe(83_333n);
    expect(frameSpan(0n, 6_840_000n, FPS.FILM_24)).toBe(164n);
    expect(() => frameSpan(10n, 0n, FPS.FILM_24)).toThrow(ClockError);
  });

  it("frame durations are exact", () => {
    expect(framesDurationUs(144, FPS.FILM_24)).toBe(6_000_000n);
    expect(framesDurationUs(96, { num: 16, den: 1 })).toBe(6_000_000n);
    expect(framesDurationUs(1, FPS.FILM_24, 1)).toBe(41_667n);
  });
});

describe("samples", () => {
  it("are sample-accurate at 48 kHz", () => {
    expect(sampleToUs(48_000)).toBe(1_000_000n);
    expect(sampleToUs(1)).toBe(20n);
    for (let k = 0n; k < 480_000n; k += 7_919n) expect(usToSample(sampleToUs(k))).toBe(k);
  });
});

describe("boundary conversions", () => {
  it("brings floats onto the clock with explicit rounding", () => {
    expect(secondsToUs(6.84)).toBe(6_840_000n);
    expect(secondsToUs(0.1)).toBe(100_000n);
    expect(secondsToUs(5.8)).toBe(5_800_000n);
    expect(secondsToUs(1.0000004)).toBe(1_000_000n);
    expect(secondsToUs(1.0000004, "ceil")).toBe(1_000_001n);
    expect(secondsToUs(-0.5)).toBe(-500_000n);
    expect(() => secondsToUs(Number.NaN)).toThrow(ClockError);
    expect(msToUs(1500)).toBe(1_500_000n);
    expect(() => msToUs(1.5)).toThrow(ClockError);
  });

  it("formats exact decimal seconds and JSON", () => {
    expect(usToSecondsString(6_840_000n)).toBe("6.840000");
    expect(usToSecondsString(41_666n)).toBe("0.041666");
    expect(usFromJson("6840000")).toBe(6_840_000n);
    expect(() => usFromJson("6.84")).toThrow(ClockError);
    expect(roundDiv(5n, 2n)).toBe(3n);
    expect(roundDiv(-5n, 2n)).toBe(-2n);
  });
});
